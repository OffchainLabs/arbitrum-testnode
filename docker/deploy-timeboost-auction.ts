import { writeFileSync } from "node:fs";
import { ethers } from "hardhat";
import hre from "hardhat";
import "@nomiclabs/hardhat-ethers";

const DEFAULT_MIN_RESERVE_PRICE = "0";
const DEFAULT_ROUND_DURATION_SECONDS = 60;
const DEFAULT_AUCTION_CLOSING_SECONDS = 15;
const DEFAULT_RESERVE_SUBMISSION_SECONDS = 15;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} not set`);
	}
	return value;
}

function optionalAddress(name: string, fallback: string): string {
	return process.env[name] || fallback;
}

function readNumberEnv(name: string, fallback: number): number {
	const value = process.env[name];
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${name} must be a number`);
	}
	return parsed;
}

async function main() {
	const deployerPrivKey = requireEnv("DEPLOYER_PRIVKEY");
	const rpcUrl = requireEnv("CHAIN_RPC");
	const outputPath = process.env.TIMEBOOST_AUCTION_OUTPUT ?? "/config/timeboost-auction.json";

	const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
	if (process.env.POLLING_INTERVAL !== undefined) {
		provider.pollingInterval = Number(process.env.POLLING_INTERVAL);
	}
	const deployerWallet = new ethers.Wallet(deployerPrivKey, provider);
	const deployerAddress = deployerWallet.address;
	const auctioneerAddress = optionalAddress("TIMEBOOST_AUCTIONEER_ADDRESS", deployerAddress);
	const adminAddress = optionalAddress("TIMEBOOST_ADMIN_ADDRESS", deployerAddress);
	const beneficiaryAddress = optionalAddress("TIMEBOOST_BENEFICIARY_ADDRESS", deployerAddress);

	console.log("Deploying Timeboost bidding token");
	const wethFactory = (await ethers.getContractFactory("TestWETH9")).connect(deployerWallet);
	const weth = await wethFactory.deploy("Wrapped Ether", "WETH");
	await weth.deployTransaction.wait();
	await weth.deployed();
	console.log("Timeboost bidding token deployed at:", weth.address);

	const roundOffset =
		process.env.TIMEBOOST_ROUND_OFFSET !== undefined
			? readNumberEnv("TIMEBOOST_ROUND_OFFSET", 0)
			: Math.floor(Date.now() / 1000);

	const initArgs = {
		_auctioneer: auctioneerAddress,
		_biddingToken: weth.address,
		_beneficiary: beneficiaryAddress,
		_roundTimingInfo: {
			offsetTimestamp: roundOffset,
			roundDurationSeconds: readNumberEnv(
				"TIMEBOOST_ROUND_DURATION_SECONDS",
				DEFAULT_ROUND_DURATION_SECONDS,
			),
			auctionClosingSeconds: readNumberEnv(
				"TIMEBOOST_AUCTION_CLOSING_SECONDS",
				DEFAULT_AUCTION_CLOSING_SECONDS,
			),
			reserveSubmissionSeconds: readNumberEnv(
				"TIMEBOOST_RESERVE_SUBMISSION_SECONDS",
				DEFAULT_RESERVE_SUBMISSION_SECONDS,
			),
		},
		_minReservePrice: ethers.BigNumber.from(
			process.env.TIMEBOOST_MIN_RESERVE_PRICE_WEI ?? DEFAULT_MIN_RESERVE_PRICE,
		),
		_auctioneerAdmin: adminAddress,
		_minReservePriceSetter: adminAddress,
		_reservePriceSetter: adminAddress,
		_reservePriceSetterAdmin: adminAddress,
		_beneficiarySetter: adminAddress,
		_roundTimingSetter: adminAddress,
		_masterAdmin: adminAddress,
	};

	console.log("Deploying Timeboost ExpressLaneAuction proxy");
	const deployment = await hre.deployments.deploy("ExpressLaneAuction", {
		from: deployerAddress,
		args: [],
		proxy: {
			proxyContract: "TransparentUpgradeableProxy",
			execute: {
				init: {
					methodName: "initialize",
					args: [initArgs],
				},
			},
			owner: adminAddress,
		},
		log: true,
	});

	const output = {
		auctionContract: deployment.address,
		auctioneer: auctioneerAddress,
		beneficiary: beneficiaryAddress,
		biddingToken: weth.address,
		roundTimingInfo: initArgs._roundTimingInfo,
	};
	writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
	console.log("Timeboost auction deployed at:", deployment.address);
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
