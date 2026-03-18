import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function getNitroContractsDir(): string {
	const dir = process.env["NITRO_CONTRACTS_DIR"];
	if (!dir) {
		throw new Error("NITRO_CONTRACTS_DIR env var is required");
	}
	return dir;
}

const WALLET_CREATED_EVENT =
	"event WalletCreated(address indexed walletAddress,address indexed executorAddress,address indexed ownerAddress,address adminProxy)";

interface EnsureValidatorWalletStakedParams {
	parentRpc: string;
	creatorAddress: `0x${string}`;
	rollupAddress: `0x${string}`;
	stakeTokenAddress: `0x${string}`;
	validatorAddress: `0x${string}`;
	validatorKey: `0x${string}`;
	funderKey: `0x${string}`;
	requiredStakeWei: bigint;
}

type EthersModule = {
	ethers: any;
};

async function loadEthers(): Promise<any> {
	const entry = resolve(getNitroContractsDir(), "node_modules/ethers/lib/index.js");
	const module = (await import(pathToFileURL(entry).href)) as EthersModule;
	return module.ethers;
}

export async function ensureValidatorWalletStaked(
	params: EnsureValidatorWalletStakedParams,
): Promise<`0x${string}`> {
	const ethers = await loadEthers();
	const provider = new ethers.providers.JsonRpcProvider(params.parentRpc);
	const validator = new ethers.Wallet(params.validatorKey, provider);
	const funder = new ethers.Wallet(params.funderKey, provider);
	const requiredStake = ethers.BigNumber.from(params.requiredStakeWei.toString());

	const creatorInterface = new ethers.utils.Interface([WALLET_CREATED_EVENT]);
	const creatorTopic = creatorInterface.getEventTopic("WalletCreated");
	const validatorTopic = ethers.utils.hexZeroPad(params.validatorAddress, 32);
	const logs = await provider.getLogs({
		address: params.creatorAddress,
		fromBlock: 0,
		toBlock: "latest",
		topics: [creatorTopic, null, validatorTopic, validatorTopic],
	});

	if (logs.length > 1) {
		throw new Error(`More than one validator wallet exists for ${params.validatorAddress}`);
	}

	let walletAddress: `0x${string}`;
	if (logs.length === 1) {
		walletAddress = creatorInterface.parseLog(logs[0]).args.walletAddress;
	} else {
		const creator = new ethers.Contract(
			params.creatorAddress,
			["function createWallet(address[] initialExecutorAllowedDests) returns (address)"],
			validator,
		);
		const tx = await creator.createWallet([params.stakeTokenAddress, params.rollupAddress]);
		const receipt = await tx.wait();
		const created = receipt.events.find((event: any) => event.topics?.[0] === creatorTopic);
		if (!created) {
			throw new Error(`WalletCreated event missing for ${params.validatorAddress}`);
		}
		walletAddress = creatorInterface.parseLog(created).args.walletAddress;
	}

	const stakeToken = new ethers.Contract(
		params.stakeTokenAddress,
		[
			"function balanceOf(address) view returns (uint256)",
			"function deposit() payable",
			"function transfer(address,uint256) returns (bool)",
		],
		funder,
	);
	const rollup = new ethers.Contract(
		params.rollupAddress,
		[
			"function amountStaked(address) view returns (uint256)",
			"function getStaker(address) view returns (uint256,bytes32,uint64,bool,address)",
		],
		provider,
	);
	const wallet = new ethers.Contract(
		walletAddress,
		["function executeTransactions(bytes[] data,address[] destination,uint256[] amount)"],
		validator,
	);

	const walletBalance = await stakeToken.balanceOf(walletAddress);
	if (walletBalance.lt(requiredStake)) {
		const shortfall = requiredStake.sub(walletBalance);
		const funderBalance = await stakeToken.balanceOf(await funder.getAddress());
		if (funderBalance.lt(shortfall)) {
			const tx = await stakeToken.deposit({ value: shortfall });
			await tx.wait();
		}
		const tx = await stakeToken.transfer(walletAddress, shortfall);
		await tx.wait();
	}

	const currentStake = await rollup.amountStaked(walletAddress);
	if (currentStake.gte(requiredStake)) {
		return walletAddress;
	}

	const staker = await rollup.getStaker(walletAddress);
	const missingStake = requiredStake.sub(currentStake);
	const erc20Interface = new ethers.utils.Interface([
		"function approve(address,uint256)",
	]);
	const rollupInterface = new ethers.utils.Interface([
		"function newStake(uint256,address)",
		"function addToDeposit(address,address,uint256)",
	]);

	const actionData = staker[3]
		? rollupInterface.encodeFunctionData("addToDeposit", [
				walletAddress,
				walletAddress,
				missingStake,
			])
		: rollupInterface.encodeFunctionData("newStake", [requiredStake, walletAddress]);

	const tx = await wallet.executeTransactions(
		[
			erc20Interface.encodeFunctionData("approve", [
				params.rollupAddress,
				ethers.constants.MaxUint256,
			]),
			actionData,
		],
		[params.stakeTokenAddress, params.rollupAddress],
		[0, 0],
		{ gasLimit: 800000 },
	);
	await tx.wait();

	return walletAddress;
}
