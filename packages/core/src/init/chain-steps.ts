import type { ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRollupPrepareDeploymentParamsConfigDefaults } from "@arbitrum/chain-sdk";
import type { Address } from "viem";
import { parseAbiItem, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { accounts } from "../accounts.js";
import { writeChainConfig } from "../chain-config.js";
import { clampDepositAmount } from "../deposit-amount.js";
import { composeRestart, composeUp, waitForRpc } from "../docker.js";
import { execOrThrow } from "../exec.js";
import { deployTestErc20 } from "../fee-token.js";
import { ZERO_ADDRESS } from "../init-helpers.js";
import { patchGeneratedL2NodeConfig, patchGeneratedL3NodeConfig } from "../node-config-patches.js";
import { inboxAbi, publicClient, rollupAbi, walletClient } from "../rpc.js";
import { startAnvilWithState } from "../runtime.js";
import { prepareNodeConfigFromDeployment } from "../sdk-chain.js";
import { markStepDone } from "../state.js";
import {
	deployL1L2TokenBridge,
	deployL2L3TokenBridge,
	ensureL1L2TokenBridgeFunding,
	ensureL2L3TokenBridgeFunding,
	getL2ChildWeth,
} from "../token-bridge.js";
import { ensureValidatorWalletStaked } from "../validator-wallet.js";
import type { InitRuntime } from "./context.js";

const L1_RPC = "http://127.0.0.1:8545";
const L2_RPC = "http://127.0.0.1:8547";
const L3_RPC = "http://127.0.0.1:8549";

// Docker-internal URLs
const L1_RPC_DOCKER = "http://host.docker.internal:8545";
const L2_RPC_DOCKER = "http://host.docker.internal:8547";
const L2_RPC_INTERNAL = "http://sequencer:8547";

const L2_DEPOSIT_READY_THRESHOLD_WEI = 250n * 10n ** 18n;
const L3_DEPOSIT_TARGET_WEI = 50n * 10n ** 18n;
const L3_DEPOSIT_RESERVE_WEI = 1n * 10n ** 18n;
const L3_DEPOSIT_READY_THRESHOLD_WEI = 10n * 10n ** 18n;
const ROLLUPCREATOR_IMAGE =
	process.env["ROLLUPCREATOR_IMAGE"] ?? "nitro-testnode-rollupcreator:latest";
const ROLLUPCREATOR_TIMEOUT_MS = Number(process.env["ROLLUPCREATOR_TIMEOUT_MS"] ?? 900_000);
const WASM_MODULE_ROOT = createRollupPrepareDeploymentParamsConfigDefaults("v3.2").wasmModuleRoot;

let anvilProcess: ChildProcess | undefined;

import type { StepRunner } from "./support.js";
import {
	applyGasEstimationWorkaround,
	copyConfigFile,
	ensureL2ValidatorFunding,
	fundL3ParentChainAccounts,
	getBalanceWei,
	patchConfigUrl,
	readDeployment,
	readJsonFile,
	sendZeroAddressTransfer,
	setL3StakerEnabled,
	waitForBalanceAtLeast,
	waitForL3RpcWithParentChainNudges,
} from "./support.js";

function deployRollupViaDocker(configDir: string, envVars: Record<string, string>): void {
	const args = [
		"run",
		"--rm",
		"--add-host",
		"host.docker.internal:host-gateway",
		"-v",
		`${configDir}:/config`,
	];
	for (const [key, value] of Object.entries(envVars)) {
		args.push("-e", `${key}=${value}`);
	}
	args.push(ROLLUPCREATOR_IMAGE, "create-rollup-testnode");
	execOrThrow("docker", args, { timeout: ROLLUPCREATOR_TIMEOUT_MS });
}

async function findRollupCreatorAddress(
	parentRpcUrl: string,
	rollupAddress: Address,
	deployedAtBlock: number,
): Promise<Address> {
	const client = publicClient(parentRpcUrl);
	const events = [
		parseAbiItem(
			"event RollupCreated(address indexed rollupAddress, address indexed nativeToken, address inboxAddress, address outbox, address rollupEventInbox, address challengeManager, address adminProxy, address sequencerInbox, address bridge, address upgradeExecutor, address validatorWalletCreator)",
		),
		parseAbiItem(
			"event RollupCreated(address indexed rollupAddress, address indexed nativeToken, address inboxAddress, address outbox, address rollupEventInbox, address challengeManager, address adminProxy, address sequencerInbox, address bridge, address upgradeExecutorAddress, address validatorUtils, address validatorWalletCreator)",
		),
	] as const;
	for (const event of events) {
		try {
			const logs = await client.getLogs({
				event,
				fromBlock: BigInt(Math.max(0, deployedAtBlock - 1)),
				toBlock: BigInt(deployedAtBlock + 1),
			});
			const matchingLog = logs.find((log) => log.args.rollupAddress === rollupAddress);
			if (matchingLog) return matchingLog.address;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[init] Warning: could not query RollupCreated logs: ${message}`);
		}
	}
	console.warn(`[init] Warning: could not find RollupCreated event for ${rollupAddress}`);
	return ZERO_ADDRESS;
}

async function addRollupCreatorToDeployment(
	parentRpcUrl: string,
	deploymentPath: string,
): Promise<void> {
	const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8")) as Record<string, unknown>;
	if (deployment["rollup-creator"]) return;
	const rollupAddress = deployment["rollup"] as Address;
	const deployedAt = deployment["deployed-at"] as number;
	if (!rollupAddress || deployedAt === undefined) return;
	const rollupCreator = await findRollupCreatorAddress(parentRpcUrl, rollupAddress, deployedAt);
	deployment["rollup-creator"] = rollupCreator;
	writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
}

function createL1Steps(runtime: InitRuntime): Record<string, StepRunner> {
	return {
		"start-l1": async (state) => {
			anvilProcess = startAnvilWithState(runtime.configDir);
			return markStepDone(state, "start-l1", {
				...(anvilProcess?.pid ? { pid: anvilProcess.pid } : {}),
			});
		},
		"wait-l1": async (state) => {
			await waitForRpc(L1_RPC);
			return markStepDone(state, "wait-l1");
		},
	};
}

function createL2DeploySteps(runtime: InitRuntime): Record<string, StepRunner> {
	return {
		"deploy-l2-rollup": async (state) => {
			writeChainConfig(runtime.configDir, "l2_chain_config.json", {
				chainId: 412346,
				owner: accounts.l2owner.address,
			});
			deployRollupViaDocker(runtime.configDir, {
				PARENT_CHAIN_RPC: L1_RPC_DOCKER,
				DEPLOYER_PRIVKEY: accounts.l2owner.privateKey,
				PARENT_CHAIN_ID: "1337",
				CHILD_CHAIN_NAME: "arb-dev-test",
				MAX_DATA_SIZE: "117964",
				OWNER_ADDRESS: accounts.l2owner.address,
				WASM_MODULE_ROOT,
				SEQUENCER_ADDRESS: accounts.sequencer.address,
				AUTHORIZE_VALIDATORS: "10",
				CHILD_CHAIN_CONFIG_PATH: "/config/l2_chain_config.json",
				CHAIN_DEPLOYMENT_INFO: "/config/l2_deployment.json",
				CHILD_CHAIN_INFO: "/config/l2_chain_info.json",
			});
			await addRollupCreatorToDeployment(L1_RPC, resolve(runtime.configDir, "l2_deployment.json"));
			copyConfigFile(runtime, "l2_deployment.json", "deployment.json");
			const deployment = readDeployment(runtime, "l2_deployment.json");
			return markStepDone(state, "deploy-l2-rollup", {
				rollup: deployment["rollup"],
				inbox: deployment["inbox"],
				bridge: deployment["bridge"],
				sequencerInbox: deployment["sequencer-inbox"],
				upgradeExecutor: deployment["upgrade-executor"],
				validatorWalletCreator: deployment["validator-wallet-creator"] ?? ZERO_ADDRESS,
				stakeToken: deployment["stake-token"] ?? ZERO_ADDRESS,
			});
		},
		"generate-l2-config": async (state) => {
			const rollupData = state.steps["deploy-l2-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l2 rollup deployment data");
			}
			const nodeConfig = prepareNodeConfigFromDeployment({
				chainName: "arb-dev-test",
				chainConfig: readJsonFile(runtime, "l2_chain_config.json"),
				deployment: readJsonFile(runtime, "l2_deployment.json"),
				parentChainId: 1337,
				parentChainRpcUrl: L1_RPC,
				parentChainBeaconRpcUrl: "http://localhost:5555",
				batchPosterPrivateKey: accounts.sequencer.privateKey,
				validatorPrivateKey: accounts.validator.privateKey,
			});
			writeFileSync(
				resolve(runtime.configDir, "nodeConfig.json"),
				JSON.stringify(nodeConfig, null, 2),
			);
			// Patch parent RPC URL for Docker networking
			patchConfigUrl(resolve(runtime.configDir, "nodeConfig.json"), L1_RPC, L1_RPC_DOCKER);
			const src = resolve(runtime.configDir, "nodeConfig.json");
			const dest = resolve(runtime.configDir, "l2-nodeConfig.json");
			const config = JSON.parse(readFileSync(src, "utf-8")) as Record<string, unknown>;
			const stakeToken = (rollupData["stakeToken"] as string | undefined) ?? ZERO_ADDRESS;
			const patched = patchGeneratedL2NodeConfig(
				config,
				accounts.sequencer.privateKey,
				stakeToken,
				accounts.validator.privateKey,
			);
			writeFileSync(dest, `${JSON.stringify(patched, null, 2)}\n`, "utf-8");
			if (stakeToken !== ZERO_ADDRESS) {
				await ensureL2ValidatorFunding(
					rollupData["rollup"] as Address,
					stakeToken as Address,
					rollupData["validatorWalletCreator"] as string,
				);
			}
			return markStepDone(state, "generate-l2-config");
		},
	};
}

function createL2RuntimeSteps(runtime: InitRuntime): Record<string, StepRunner> {
	return {
		"start-l2": async (state) => {
			composeUp(["sequencer", "validator"], runtime.dockerOpts);
			return markStepDone(state, "start-l2");
		},
		"wait-l2": async (state) => {
			await waitForRpc(L2_RPC, 120_000);
			return markStepDone(state, "wait-l2");
		},
		"deposit-eth-to-l2": async (state) => {
			const rollupData = state.steps["deploy-l2-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l2 rollup deployment data");
			}
			const currentL2BalanceWei = await getBalanceWei(accounts.funnel.address, L2_RPC);
			if (currentL2BalanceWei >= L2_DEPOSIT_READY_THRESHOLD_WEI) {
				console.log("[init] L2 funnel already funded; skipping inbox deposit");
				return markStepDone(state, "deposit-eth-to-l2", {
					skipped: true,
					reason: "l2 funnel already has balance",
				});
			}
			const inbox = rollupData["inbox"] as Address;
			// Call depositEth() on the Inbox contract with ETH value
			const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
			const client = walletClient(L1_RPC, accounts.funnel.privateKey);
			await client.writeContract({
				account: funnelAccount,
				address: inbox,
				abi: inboxAbi,
				functionName: "depositEth",
				value: parseEther("100000"),
			});
			await waitForBalanceAtLeast(accounts.funnel.address, L2_RPC, L2_DEPOSIT_READY_THRESHOLD_WEI);
			return markStepDone(state, "deposit-eth-to-l2");
		},
		"deploy-l2-token-bridge": async (state) => {
			const rollupData = state.steps["deploy-l2-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l2 rollup deployment data");
			}
			await ensureL1L2TokenBridgeFunding(L1_RPC, L2_RPC);
			await new Promise((resolve) => setTimeout(resolve, 10_000));
			await deployL1L2TokenBridge({
					compose: runtime.dockerOpts,
					configDir: runtime.configDir,
					rollupAddress: rollupData["rollup"] as string,
					rollupOwnerKey: accounts.l2owner.privateKey,
					parentRpc: L1_RPC_DOCKER,
					childRpc: L2_RPC_INTERNAL,
					parentKey: accounts.l2owner.privateKey,
					childKey: accounts.l2owner.privateKey,
				});
			return markStepDone(state, "deploy-l2-token-bridge");
		},
	};
}

async function fundL3DeployerAccounts(): Promise<void> {
	console.log("[init] Funding L3 deployer accounts on L2");
	for (const { address, label, amount } of [
		{ address: accounts.l3owner.address, label: "l3owner", amount: parseEther("1000") },
		{
			address: accounts.userTokenBridgeDeployer.address,
			label: "userTokenBridgeDeployer",
			amount: parseEther("100"),
		},
		{
			address: accounts.userFeeTokenDeployer.address,
			label: "userFeeTokenDeployer",
			amount: parseEther("100"),
		},
	]) {
		const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
		const client = walletClient(L2_RPC, accounts.funnel.privateKey);
		await client.sendTransaction({
			account: funnelAccount,
			to: address,
			value: amount,
		});
		console.log(`[init] Funded ${label} on L2 with ${amount} wei`);
	}
	// Also fund deployer accounts on L1
	const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
	const l1Client = walletClient(L1_RPC, accounts.funnel.privateKey);
	for (const { address, label } of [
		{ address: accounts.userTokenBridgeDeployer.address, label: "userTokenBridgeDeployer" },
		{ address: accounts.userFeeTokenDeployer.address, label: "userFeeTokenDeployer" },
	]) {
		await l1Client.sendTransaction({
			account: funnelAccount,
			to: address,
			value: parseEther("100"),
		});
		console.log(`[init] Funded ${label} on L1 with 100ether`);
	}
}

function createL3Steps(
	runtime: InitRuntime,
	feeTokenDecimals?: number,
): Record<string, StepRunner> {
	return {
		"deploy-l3-rollup": async (state) => {
			await fundL3DeployerAccounts();
			writeChainConfig(runtime.configDir, "l3_chain_config.json", {
				chainId: 333333,
				owner: accounts.l3owner.address,
			});
			await applyGasEstimationWorkaround();

			// If custom fee token is requested, deploy an ERC20 on L2
			let feeTokenAddress: string | undefined;
			if (feeTokenDecimals !== undefined) {
				const mintAmount = 10n ** BigInt(feeTokenDecimals) * 1_000_000_000n;
				feeTokenAddress = await deployTestErc20({
					rpcUrl: L2_RPC,
					deployerKey: accounts.userFeeTokenDeployer.privateKey,
					name: `TestCustomFeeToken${feeTokenDecimals}`,
					symbol: `FEE${feeTokenDecimals}`,
					decimals: feeTokenDecimals,
					initialMintAddresses: [
						accounts.userFeeTokenDeployer.address,
						accounts.funnel.address,
						accounts.l3owner.address,
					],
					mintAmountPerAddress: mintAmount,
				});
				console.log(
					`[init] Custom fee token deployed at ${feeTokenAddress} with ${feeTokenDecimals} decimals`,
				);
			}

			const rollupEnv: Record<string, string> = {
				PARENT_CHAIN_RPC: L2_RPC_DOCKER,
				DEPLOYER_PRIVKEY: accounts.l3owner.privateKey,
				PARENT_CHAIN_ID: "412346",
				CHILD_CHAIN_NAME: "orbit-dev-test",
				MAX_DATA_SIZE: "104857",
				OWNER_ADDRESS: accounts.l3owner.address,
				WASM_MODULE_ROOT,
				SEQUENCER_ADDRESS: accounts.l3sequencer.address,
				AUTHORIZE_VALIDATORS: "10",
				CHILD_CHAIN_CONFIG_PATH: "/config/l3_chain_config.json",
				CHAIN_DEPLOYMENT_INFO: "/config/l3_deployment.json",
				CHILD_CHAIN_INFO: "/config/l3_chain_info.json",
			};
			if (feeTokenAddress) {
				rollupEnv["FEE_TOKEN_ADDRESS"] = feeTokenAddress;
			}
			deployRollupViaDocker(runtime.configDir, rollupEnv);
			await addRollupCreatorToDeployment(L2_RPC, resolve(runtime.configDir, "l3_deployment.json"));

			copyConfigFile(runtime, "l3_deployment.json", "l3deployment.json");
			const deployment = readDeployment(runtime, "l3_deployment.json");
			return markStepDone(state, "deploy-l3-rollup", {
				rollup: deployment["rollup"],
				inbox: deployment["inbox"],
				bridge: deployment["bridge"],
				sequencerInbox: deployment["sequencer-inbox"],
				upgradeExecutor: deployment["upgrade-executor"],
				validatorWalletCreator: deployment["validator-wallet-creator"] ?? ZERO_ADDRESS,
				stakeToken: deployment["stake-token"] ?? ZERO_ADDRESS,
				...(feeTokenAddress ? { feeTokenAddress } : {}),
				...(feeTokenDecimals !== undefined ? { feeTokenDecimals } : {}),
			});
		},
		"generate-l3-config": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			const nodeConfig = prepareNodeConfigFromDeployment({
				chainName: "orbit-dev-test",
				chainConfig: readJsonFile(runtime, "l3_chain_config.json"),
				deployment: readJsonFile(runtime, "l3_deployment.json"),
				parentChainId: 412346,
				parentChainRpcUrl: L2_RPC,
				batchPosterPrivateKey: accounts.l3sequencer.privateKey,
				validatorPrivateKey: accounts.l3owner.privateKey,
			});
			writeFileSync(
				resolve(runtime.configDir, "nodeConfig.json"),
				JSON.stringify(nodeConfig, null, 2),
			);
			patchConfigUrl(resolve(runtime.configDir, "nodeConfig.json"), L2_RPC, L2_RPC_DOCKER);
			const src = resolve(runtime.configDir, "nodeConfig.json");
			const dest = resolve(runtime.configDir, "l3-nodeConfig.json");
			const config = JSON.parse(readFileSync(src, "utf-8")) as Record<string, unknown>;
			const patched = patchGeneratedL3NodeConfig(
				config,
				L2_RPC_INTERNAL,
				false,
				accounts.l3sequencer.privateKey,
			);
			writeFileSync(dest, JSON.stringify(patched, null, 2));
			return markStepDone(state, "generate-l3-config");
		},
		"start-l3": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			await fundL3ParentChainAccounts();
			const stakeToken = rollupData["stakeToken"] as string | undefined;
			const validatorWalletCreator = rollupData["validatorWalletCreator"] as string | undefined;
			if (
				stakeToken &&
				stakeToken !== ZERO_ADDRESS &&
				validatorWalletCreator &&
				validatorWalletCreator !== ZERO_ADDRESS
			) {
				const requiredStakeWei = (await publicClient(L2_RPC).readContract({
					address: rollupData["rollup"] as Address,
					abi: rollupAbi,
					functionName: "baseStake",
				})) as bigint;
				await ensureValidatorWalletStaked({
					parentRpc: L2_RPC,
					creatorAddress: validatorWalletCreator as `0x${string}`,
					rollupAddress: rollupData["rollup"] as `0x${string}`,
					stakeTokenAddress: stakeToken as `0x${string}`,
					validatorAddress: accounts.validator.address,
					validatorKey: accounts.validator.privateKey,
					funderKey: accounts.funnel.privateKey,
					requiredStakeWei,
				});
			}
			composeUp(["l3node"], runtime.dockerOpts);
			return markStepDone(state, "start-l3");
		},
		"wait-l3": async (state) => {
			await waitForL3RpcWithParentChainNudges(300_000);
			return markStepDone(state, "wait-l3");
		},
		"deposit-eth-to-l3": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			const existingL3BalanceWei = await getBalanceWei(accounts.funnel.address, L3_RPC);
			if (existingL3BalanceWei >= L3_DEPOSIT_READY_THRESHOLD_WEI) {
				console.log("[init] L3 funnel already funded; skipping inbox deposit");
				return markStepDone(state, "deposit-eth-to-l3", {
					skipped: true,
					reason: "l3 funnel already has balance",
				});
			}
			const inbox = rollupData["inbox"] as Address;
			const balanceWei = await getBalanceWei(accounts.funnel.address, L2_RPC);
			const depositWei = clampDepositAmount({
				balanceWei,
				desiredWei: L3_DEPOSIT_TARGET_WEI,
				reserveWei: L3_DEPOSIT_RESERVE_WEI,
			});
			console.log(`[init] Depositing ${depositWei} wei from L2 into L3 inbox`);
			const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
			const l2Client = walletClient(L2_RPC, accounts.funnel.privateKey);
			await l2Client.writeContract({
				account: funnelAccount,
				address: inbox,
				abi: inboxAbi,
				functionName: "depositEth",
				value: depositWei,
			});
			await waitForBalanceAtLeast(accounts.funnel.address, L3_RPC, L3_DEPOSIT_READY_THRESHOLD_WEI);
			// Fund userFeeTokenDeployer on L3 so portal E2E tests can use it as a funder
			const l3Client = walletClient(L3_RPC, accounts.funnel.privateKey);
			const l3FunnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
			await l3Client.sendTransaction({
				account: l3FunnelAccount,
				to: accounts.userFeeTokenDeployer.address,
				value: parseEther("10"),
			});
			console.log("[init] Funded userFeeTokenDeployer on L3 with 10 ETH");
			return markStepDone(state, "deposit-eth-to-l3");
		},
		"deploy-l3-token-bridge": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			await ensureL2L3TokenBridgeFunding(L2_RPC, L3_RPC);
			await deployL2L3TokenBridge({
				compose: runtime.dockerOpts,
				configDir: runtime.configDir,
				rollupAddress: rollupData["rollup"] as string,
				rollupOwnerKey: accounts.l3owner.privateKey,
				parentRpc: L2_RPC_INTERNAL,
				childRpc: "http://l3node:8547",
				parentKey: accounts.l3owner.privateKey,
				childKey: accounts.l3owner.privateKey,
				parentWethOverride: getL2ChildWeth(runtime.configDir),
			});
			await sendZeroAddressTransfer(L2_RPC);
			await sendZeroAddressTransfer(L2_RPC);
			execOrThrow("sleep", ["5"], { timeout: 6_000 });
			composeRestart(["l3node"], runtime.dockerOpts);
			await waitForL3RpcWithParentChainNudges(120_000);
			return markStepDone(state, "deploy-l3-token-bridge");
		},
	};
}

export function makeStepRunners(
	runtime: InitRuntime,
	feeTokenDecimals?: number,
): Record<string, StepRunner> {
	return {
		...createL1Steps(runtime),
		...createL2DeploySteps(runtime),
		...createL2RuntimeSteps(runtime),
		...createL3Steps(runtime, feeTokenDecimals),
	};
}
