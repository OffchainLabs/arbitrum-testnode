import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { writeFileSync } from "node:fs";
import { BigNumber } from "ethers";
import { deployAllContracts } from "../deploymentUtils";

async function main() {
	const deployerPrivKey = process.env.DEPLOYER_PRIVKEY;
	if (!deployerPrivKey) {
		throw new Error("DEPLOYER_PRIVKEY not set");
	}

	const parentChainRpc = process.env.PARENT_CHAIN_RPC;
	if (!parentChainRpc) {
		throw new Error("PARENT_CHAIN_RPC not set");
	}

	const deployerWallet = new ethers.Wallet(
		deployerPrivKey,
		new ethers.providers.JsonRpcProvider(parentChainRpc),
	);
	if (process.env.POLLING_INTERVAL !== undefined) {
		deployerWallet.provider.pollingInterval = Number(process.env.POLLING_INTERVAL);
	}

	const maxDataSize =
		process.env.MAX_DATA_SIZE !== undefined
			? ethers.BigNumber.from(process.env.MAX_DATA_SIZE)
			: ethers.BigNumber.from(117964);

	const factoryCode = await deployerWallet.provider.getCode(
		"0x4e59b44847b379578588920ca78fbf26c0b4956c",
	);

	if (factoryCode.length <= 2) {
		console.log("Deploying CREATE2 factory");
		const fundingTx = await deployerWallet.sendTransaction({
			to: "0x3fab184622dc19b6109349b94811493bf2a45362",
			value: ethers.utils.parseEther("0.01"),
		});
		await fundingTx.wait();
		const create2SignedTx =
			"0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222";
		const create2DeployTx = await deployerWallet.provider.sendTransaction(create2SignedTx);
		await create2DeployTx.wait();
	}

	// nitro-contracts v2.1 has no TestWETH9 mock and the v2.1 RollupCreator
	// defaults the rollup stake token to the zero address (ETH staking), so no
	// WETH stake token is deployed here.
	const stakeToken = "0x0000000000000000000000000000000000000000";

	console.log("Deploy RollupCreator");
	const contracts = await deployAllContracts(deployerWallet, maxDataSize, false);

	console.log("Set templates on the Rollup Creator");
	await (
		await contracts.rollupCreator.setTemplates(
			contracts.bridgeCreator.address,
			contracts.osp.address,
			contracts.challengeManager.address,
			contracts.rollupAdmin.address,
			contracts.rollupUser.address,
			contracts.upgradeExecutor.address,
			contracts.validatorUtils.address,
			contracts.validatorWalletCreator.address,
			contracts.deployHelper.address,
			{ gasLimit: BigNumber.from("300000") },
		)
	).wait();

	console.log("RollupCreator created at address:", contracts.rollupCreator.address);
	writeFileSync(
		process.env.ROLLUP_CREATOR_OUTPUT ?? "/config/rollup_creator.json",
		`${JSON.stringify({ rollupCreator: contracts.rollupCreator.address, stakeToken }, null, 2)}\n`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
