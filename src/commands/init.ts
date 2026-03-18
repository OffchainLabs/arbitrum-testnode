import type { ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Cli, z } from "incur";
import type { Address } from "viem";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { accounts } from "../accounts.js";
import { writeChainConfig } from "../chain-config.js";
import { clampDepositAmount } from "../deposit-amount.js";
import { composeRestart, composeUp, waitForRpc } from "../docker.js";
import { arbitrum, execOrThrow } from "../exec.js";
import { ZERO_ADDRESS } from "../init-helpers.js";
import { getL3ParentChainFundingPlan } from "../l3-parent-chain-funding.js";
import { patchGeneratedL2NodeConfig, patchGeneratedL3NodeConfig } from "../node-config-patches.js";
import {
	erc20Abi,
	getBalanceWei as getBalanceWeiRpc,
	inboxAbi,
	publicClient,
	rollupAbi,
	walletClient,
} from "../rpc.js";
import {
	finishActiveRun,
	logRunEvent,
	startDetachedInitRun,
	startInlineRunLogging,
	startRunLoggingFromEnv,
	updateRunStep,
} from "../run-logger.js";
import { startAnvilWithState, startNitroFromSnapshot, stopRuntime } from "../runtime.js";
import { installSnapshotRelease } from "../snapshot-release.js";
import {
	DEFAULT_SNAPSHOT_ID,
	captureSnapshot,
	hasSnapshot,
	restoreSnapshot,
	verifySnapshotSemanticState,
} from "../snapshot.js";
import type { InitState } from "../state.js";
import {
	createState,
	getNextPendingStep,
	loadState,
	markStepDone,
	markStepFailed,
	saveState,
} from "../state.js";
import {
	deployL1L2TokenBridge,
	deployL2L3TokenBridge,
	ensureL1L2TokenBridgeFunding,
	ensureL2L3TokenBridgeFunding,
	getL2ChildWeth,
} from "../token-bridge.js";
import { ensureValidatorWalletStaked } from "../validator-wallet.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");

const L1_RPC = "http://127.0.0.1:8545";
const L2_RPC = "http://127.0.0.1:8547";
const L3_RPC = "http://127.0.0.1:8549";

// Docker-internal URLs
const L1_RPC_DOCKER = "http://host.docker.internal:8545";
const L2_RPC_DOCKER = "http://host.docker.internal:8547";
const L2_RPC_INTERNAL = "http://sequencer:8547";

const ROLLUPCREATOR_IMAGE = "nitro-testnode-rollupcreator:latest";
const WASM_MODULE_ROOT = "0x8a7513bf7bb3e3db04b0d982d0e973bcf57bf8b88aef7c6d03dba3a81a56a499";
const L2_DEPOSIT_VALUE = "100000ether";
const L2_DEPOSIT_READY_THRESHOLD_WEI = 250n * 10n ** 18n;
const L3_DEPOSIT_TARGET_WEI = 50n * 10n ** 18n;
const L3_DEPOSIT_RESERVE_WEI = 1n * 10n ** 18n;
const L3_DEPOSIT_READY_THRESHOLD_WEI = 10n * 10n ** 18n;
const L3_PARENT_CHAIN_FUNDING_RESERVE_WEI = 5n * 10n ** 16n;
const L2_VALIDATOR_GAS_TARGET_WEI = 1n * 10n ** 18n;

const DOCKER_OPTS = { composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" };

let anvilProcess: ChildProcess | undefined;

const INIT_STEPS = [
	"start-l1",
	"wait-l1",
	"deploy-l2-rollup",
	"generate-l2-config",
	"start-l2",
	"wait-l2",
	"deposit-eth-to-l2",
	"deploy-l2-token-bridge",
	"deploy-l3-rollup",
	"generate-l3-config",
	"start-l3",
	"wait-l3",
	"deposit-eth-to-l3",
	"deploy-l3-token-bridge",
] as const;

type StepRunner = (state: InitState) => Promise<InitState>;

interface DeploymentJson {
	rollup: string;
	inbox: string;
	bridge: string;
	"sequencer-inbox": string;
	"upgrade-executor": string;
	"stake-token"?: string;
	"validator-wallet-creator"?: string;
}

function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function setL3StakerEnabled(enabled: boolean): void {
	const configPath = resolve(CONFIG_DIR, "l3-nodeConfig.json");
	const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
	const patched = patchGeneratedL3NodeConfig(config, L2_RPC_INTERNAL, enabled);
	writeFileSync(configPath, JSON.stringify(patched, null, 2));
}

async function applyGasEstimationWorkaround(): Promise<void> {
	console.log("[init] Applying L1/L2 gas estimation workaround");
	for (const rpcUrl of [L1_RPC, L2_RPC]) {
		await sendZeroAddressTransfer(rpcUrl, parseEther("1"));
	}
}

async function sendZeroAddressTransfer(rpcUrl: string, value = 1n): Promise<void> {
	try {
		const account = privateKeyToAccount(accounts.funnel.privateKey);
		const client = walletClient(rpcUrl, accounts.funnel.privateKey);
		await client.sendTransaction({
			account,
			to: ZERO_ADDRESS as Address,
			value,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			message.includes("replacement transaction underpriced") ||
			message.includes("already known")
		) {
			console.warn(`[init] Skipping gas-estimation poke on ${rpcUrl}: ${message}`);
			return;
		}
		throw error;
	}
}

async function getBalanceWei(address: Address, rpcUrl: string): Promise<bigint> {
	return getBalanceWeiRpc(address, rpcUrl);
}

async function getErc20BalanceWei(
	tokenAddress: Address,
	address: Address,
	rpcUrl: string,
): Promise<bigint> {
	return publicClient(rpcUrl).readContract({
		address: tokenAddress,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [address],
	}) as Promise<bigint>;
}

async function topUpEthIfNeeded(
	address: Address,
	targetWei: bigint,
	rpcUrl: string,
	senderKey: `0x${string}`,
	label: string,
): Promise<void> {
	const currentBalanceWei = await getBalanceWei(address, rpcUrl);
	if (currentBalanceWei >= targetWei) {
		return;
	}

	const senderAddress = accounts.funnel.address;
	const senderBalanceWei = await getBalanceWei(senderAddress, rpcUrl);
	const depositWei = clampDepositAmount({
		balanceWei: senderBalanceWei,
		desiredWei: targetWei - currentBalanceWei,
		reserveWei: L3_PARENT_CHAIN_FUNDING_RESERVE_WEI,
	});

	console.log(`[init] Funding ${label} on ${rpcUrl} with ${depositWei} wei`);
	const account = privateKeyToAccount(senderKey);
	const client = walletClient(rpcUrl, senderKey);
	await client.sendTransaction({
		account,
		to: address,
		value: depositWei,
	});
}

async function ensureL2ValidatorFunding(
	rollupAddress: Address,
	stakeTokenAddress: Address,
	validatorWalletCreatorAddress: string,
): Promise<void> {
	await topUpEthIfNeeded(
		accounts.validator.address,
		L2_VALIDATOR_GAS_TARGET_WEI,
		L1_RPC,
		accounts.funnel.privateKey,
		"L2 validator gas",
	);

	const requiredStakeWei = (await publicClient(L1_RPC).readContract({
		address: rollupAddress,
		abi: rollupAbi,
		functionName: "baseStake",
	})) as bigint;
	const currentStakeWei = await getErc20BalanceWei(
		stakeTokenAddress,
		accounts.validator.address,
		L1_RPC,
	);
	if (currentStakeWei >= requiredStakeWei) {
		return;
	}

	const neededStakeWei = requiredStakeWei - currentStakeWei;
	const funderStakeWei = await getErc20BalanceWei(
		stakeTokenAddress,
		accounts.funnel.address,
		L1_RPC,
	);
	if (funderStakeWei < neededStakeWei) {
		const shortfallWei = neededStakeWei - funderStakeWei;
		console.log(`[init] Wrapping ${shortfallWei} wei into stake token for L2 validator`);
		const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
		const depositClient = walletClient(L1_RPC, accounts.funnel.privateKey);
		await depositClient.writeContract({
			account: funnelAccount,
			address: stakeTokenAddress,
			abi: erc20Abi,
			functionName: "deposit",
			value: shortfallWei,
		});
	}

	console.log(`[init] Funding L2 validator stake token with ${neededStakeWei} units`);
	const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
	const transferClient = walletClient(L1_RPC, accounts.funnel.privateKey);
	await transferClient.writeContract({
		account: funnelAccount,
		address: stakeTokenAddress,
		abi: erc20Abi,
		functionName: "transfer",
		args: [accounts.validator.address, neededStakeWei],
	});

	await ensureValidatorWalletStaked({
		parentRpc: L1_RPC,
		creatorAddress: validatorWalletCreatorAddress as `0x${string}`,
		rollupAddress: rollupAddress,
		stakeTokenAddress: stakeTokenAddress,
		validatorAddress: accounts.validator.address,
		validatorKey: accounts.validator.privateKey,
		funderKey: accounts.funnel.privateKey,
		requiredStakeWei,
	});
}

async function fundL3ParentChainAccounts(): Promise<void> {
	for (const transfer of getL3ParentChainFundingPlan()) {
		const recipientBalanceWei = await getBalanceWei(transfer.address as Address, L2_RPC);
		if (recipientBalanceWei >= transfer.amountWei) {
			console.log(`[init] ${transfer.label} already funded on L2 parent chain`);
			continue;
		}
		const senderBalanceWei = await getBalanceWei(accounts.funnel.address, L2_RPC);
		let topUpWei: bigint;
		try {
			topUpWei = clampDepositAmount({
				balanceWei: senderBalanceWei,
				desiredWei: transfer.amountWei - recipientBalanceWei,
				reserveWei: L3_PARENT_CHAIN_FUNDING_RESERVE_WEI,
			});
		} catch {
			console.warn(`[init] Skipping ${transfer.label} funding; funnel L2 balance is too low`);
			continue;
		}
		console.log(`[init] Funding ${transfer.label} on L2 parent chain with ${topUpWei} wei`);
		const funnelAccount = privateKeyToAccount(accounts.funnel.privateKey);
		const client = walletClient(L2_RPC, accounts.funnel.privateKey);
		await client.sendTransaction({
			account: funnelAccount,
			to: transfer.address as Address,
			value: topUpWei,
		});
	}
}

async function waitForBalanceAtLeast(
	address: Address,
	rpcUrl: string,
	targetWei: bigint,
	timeoutMs = 120_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if ((await getBalanceWei(address, rpcUrl)) >= targetWei) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
	throw new Error(`Balance for ${address} on ${rpcUrl} did not reach ${targetWei} wei`);
}

async function waitForL3RpcWithParentChainNudges(timeoutMs = 300_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			await waitForRpc(L3_RPC, 5_000, 500);
			return;
		} catch {
			await sendZeroAddressTransfer(L2_RPC);
		}
	}

	throw new Error(`RPC at ${L3_RPC} not ready after ${timeoutMs}ms`);
}

function deployRollupViaDocker(envVars: Record<string, string>): void {
	const args = [
		"run",
		"--rm",
		"--add-host",
		"host.docker.internal:host-gateway",
		"-v",
		`${CONFIG_DIR}:/config`,
	];
	for (const [key, value] of Object.entries(envVars)) {
		args.push("-e", `${key}=${value}`);
	}
	args.push(ROLLUPCREATOR_IMAGE, "create-rollup-testnode");
	execOrThrow("docker", args, { timeout: 300_000 });
}

function patchConfigUrl(configPath: string, hostUrl: string, dockerUrl: string): void {
	const content = readFileSync(configPath, "utf-8");
	const patched = content.replaceAll(hostUrl, dockerUrl);
	writeFileSync(configPath, patched, "utf-8");
}

function copyConfigFile(sourceName: string, destName: string): void {
	writeFileSync(
		resolve(CONFIG_DIR, destName),
		readFileSync(resolve(CONFIG_DIR, sourceName), "utf-8"),
	);
}

function readDeployment(name: string): DeploymentJson {
	const raw = readFileSync(resolve(CONFIG_DIR, name), "utf-8");
	return JSON.parse(raw) as DeploymentJson;
}

function createL1Steps(): Record<string, StepRunner> {
	return {
		"start-l1": async (state) => {
			anvilProcess = startAnvilWithState(CONFIG_DIR);
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

function createL2DeploySteps(): Record<string, StepRunner> {
	return {
		"deploy-l2-rollup": async (state) => {
			writeChainConfig(CONFIG_DIR, "l2_chain_config.json", {
				chainId: 412346,
				owner: accounts.l2owner.address,
			});
			deployRollupViaDocker({
				PARENT_CHAIN_RPC: L1_RPC_DOCKER,
				DEPLOYER_PRIVKEY: accounts.l2owner.privateKey,
				PARENT_CHAIN_ID: "1337",
				CHILD_CHAIN_NAME: "arb-dev-test",
				MAX_DATA_SIZE: "117964",
				OWNER_ADDRESS: accounts.l2owner.address,
				WASM_MODULE_ROOT: WASM_MODULE_ROOT,
				SEQUENCER_ADDRESS: accounts.sequencer.address,
				AUTHORIZE_VALIDATORS: "10",
				CHILD_CHAIN_CONFIG_PATH: "/config/l2_chain_config.json",
				CHAIN_DEPLOYMENT_INFO: "/config/l2_deployment.json",
				CHILD_CHAIN_INFO: "/config/l2_chain_info.json",
			});
			copyConfigFile("l2_deployment.json", "deployment.json");
			const deployment = readDeployment("l2_deployment.json");
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
			arbitrum(
				[
					"deploy",
					"generate-config",
					"--rollup",
					rollupData["rollup"] as string,
					"--chain-name",
					"arb-dev-test",
					"--parent-rpc",
					L1_RPC,
					"--parent-chain-id",
					"1337",
					"--parent-beacon-rpc",
					"http://localhost:5555",
					"--batch-poster-key",
					accounts.sequencer.privateKey,
					"--validator-key",
					accounts.validator.privateKey,
					"--output-dir",
					CONFIG_DIR,
					"--type",
					"node",
				],
				{ timeout: 60_000 },
			);
			// Patch parent RPC URL for Docker networking
			patchConfigUrl(resolve(CONFIG_DIR, "nodeConfig.json"), L1_RPC, L1_RPC_DOCKER);
			const src = resolve(CONFIG_DIR, "nodeConfig.json");
			const dest = resolve(CONFIG_DIR, "l2-nodeConfig.json");
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

function createL2RuntimeSteps(): Record<string, StepRunner> {
	return {
		"start-l2": async (state) => {
			composeUp(["sequencer", "validator"], DOCKER_OPTS);
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
				compose: DOCKER_OPTS,
				configDir: CONFIG_DIR,
				rollupAddress: rollupData["rollup"] as string,
				rollupOwnerKey: accounts.l2owner.privateKey,
				parentRpc: L1_RPC_DOCKER,
				childRpc: L2_RPC_INTERNAL,
				parentKey: accounts.funnel.privateKey,
				childKey: accounts.funnel.privateKey,
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

function createL3Steps(): Record<string, StepRunner> {
	return {
		"deploy-l3-rollup": async (state) => {
			await fundL3DeployerAccounts();
			writeChainConfig(CONFIG_DIR, "l3_chain_config.json", {
				chainId: 333333,
				owner: accounts.l3owner.address,
			});
			await applyGasEstimationWorkaround();
			deployRollupViaDocker({
				PARENT_CHAIN_RPC: L2_RPC_DOCKER,
				DEPLOYER_PRIVKEY: accounts.l3owner.privateKey,
				PARENT_CHAIN_ID: "412346",
				CHILD_CHAIN_NAME: "orbit-dev-test",
				MAX_DATA_SIZE: "104857",
				OWNER_ADDRESS: accounts.l3owner.address,
				WASM_MODULE_ROOT: WASM_MODULE_ROOT,
				SEQUENCER_ADDRESS: accounts.l3sequencer.address,
				AUTHORIZE_VALIDATORS: "10",
				CHILD_CHAIN_CONFIG_PATH: "/config/l3_chain_config.json",
				CHAIN_DEPLOYMENT_INFO: "/config/l3_deployment.json",
				CHILD_CHAIN_INFO: "/config/l3_chain_info.json",
			});
			copyConfigFile("l3_deployment.json", "l3deployment.json");
			const deployment = readDeployment("l3_deployment.json");
			return markStepDone(state, "deploy-l3-rollup", {
				rollup: deployment["rollup"],
				inbox: deployment["inbox"],
				bridge: deployment["bridge"],
				sequencerInbox: deployment["sequencer-inbox"],
				upgradeExecutor: deployment["upgrade-executor"],
				validatorWalletCreator: deployment["validator-wallet-creator"] ?? ZERO_ADDRESS,
				stakeToken: deployment["stake-token"] ?? ZERO_ADDRESS,
			});
		},
		"generate-l3-config": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			arbitrum(
				[
					"deploy",
					"generate-config",
					"--rollup",
					rollupData["rollup"] as string,
					"--chain-name",
					"orbit-dev-test",
					"--parent-rpc",
					L2_RPC,
					"--parent-chain-id",
					"412346",
					"--batch-poster-key",
					accounts.l3sequencer.privateKey,
					"--validator-key",
					accounts.l3owner.privateKey,
					"--output-dir",
					CONFIG_DIR,
					"--type",
					"node",
				],
				{ timeout: 60_000 },
			);
			patchConfigUrl(resolve(CONFIG_DIR, "nodeConfig.json"), L2_RPC, L2_RPC_DOCKER);
			const src = resolve(CONFIG_DIR, "nodeConfig.json");
			const dest = resolve(CONFIG_DIR, "l3-nodeConfig.json");
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
			composeUp(["l3node"], DOCKER_OPTS);
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
			return markStepDone(state, "deposit-eth-to-l3");
		},
		"deploy-l3-token-bridge": async (state) => {
			const rollupData = state.steps["deploy-l3-rollup"]?.data;
			if (!rollupData) {
				throw new Error("Missing l3 rollup deployment data");
			}
			await ensureL2L3TokenBridgeFunding(L2_RPC, L3_RPC);
			await deployL2L3TokenBridge({
				compose: DOCKER_OPTS,
				configDir: CONFIG_DIR,
				rollupAddress: rollupData["rollup"] as string,
				rollupOwnerKey: accounts.l3owner.privateKey,
				parentRpc: L2_RPC_INTERNAL,
				childRpc: "http://l3node:8547",
				parentKey: accounts.userTokenBridgeDeployer.privateKey,
				childKey: accounts.userTokenBridgeDeployer.privateKey,
				parentWethOverride: getL2ChildWeth(CONFIG_DIR),
			});
			setL3StakerEnabled(true);
			await sendZeroAddressTransfer(L2_RPC);
			await sendZeroAddressTransfer(L2_RPC);
			execOrThrow("sleep", ["5"], { timeout: 6_000 });
			composeRestart(["l3node"], DOCKER_OPTS);
			await waitForL3RpcWithParentChainNudges(120_000);
			return markStepDone(state, "deploy-l3-token-bridge");
		},
	};
}

function makeStepRunners(): Record<string, StepRunner> {
	return {
		...createL1Steps(),
		...createL2DeploySteps(),
		...createL2RuntimeSteps(),
		...createL3Steps(),
	};
}

async function runInitLoop(): Promise<{
	success: boolean;
	failedStep?: string;
	error?: string;
	timings?: Record<string, number>;
}> {
	let state = loadState(CONFIG_DIR) ?? createState();
	const runners = makeStepRunners();
	const steps = [...INIT_STEPS];
	const timings: Record<string, number> = {};

	let nextStep = getNextPendingStep(state, steps);
	while (nextStep !== null) {
		const stepStart = Date.now();
		console.log(`[init] Running step: ${nextStep}`);
		updateRunStep(nextStep);
		logRunEvent("info", "step.started", `Running step ${nextStep}`, { step: nextStep });
		const runner = runners[nextStep];
		if (!runner) {
			throw new Error(`Unknown step: ${nextStep}`);
		}
		try {
			state = await runner(state);
			const elapsed = Date.now() - stepStart;
			timings[nextStep] = elapsed;
			saveState(CONFIG_DIR, state);
			console.log(`[init] Step done: ${nextStep} (${(elapsed / 1000).toFixed(1)}s)`);
			logRunEvent("info", "step.completed", `Step ${nextStep} completed`, {
				step: nextStep,
				elapsedMs: elapsed,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			state = markStepFailed(state, nextStep, msg);
			saveState(CONFIG_DIR, state);
			console.error(`[init] Step failed: ${nextStep} - ${msg}`);
			logRunEvent("error", "step.failed", `Step ${nextStep} failed`, {
				step: nextStep,
				error: msg,
			});
			return { success: false, failedStep: nextStep, error: msg, timings };
		}
		nextStep = getNextPendingStep(state, steps);
	}

	return { success: true, timings };
}

export const INIT_STEP_NAMES = [...INIT_STEPS];

export const initCli = Cli.create("init", {
	description: "Initialize the testnode (L1 + L2 + L3 with bridges)",
	options: z.object({
		background: z
			.boolean()
			.optional()
			.describe("Start init in the background and return the run metadata"),
		foreground: z.boolean().optional().describe("Internal worker mode for detached init runs"),
		rebuild: z
			.boolean()
			.optional()
			.describe("Force a full rebuild instead of restoring the default snapshot"),
		snapshotVersion: z
			.string()
			.optional()
			.describe("Snapshot release tag to install when the default snapshot is missing"),
	}),
	async run(c) {
		if (c.options.background && !c.options.foreground) {
			const extraArgs = c.options.snapshotVersion
				? ["--snapshot-version", c.options.snapshotVersion]
				: [];
			const run = startDetachedInitRun(CONFIG_DIR, PROJECT_ROOT, extraArgs);
			return {
				success: true,
				detached: true,
				runId: run.runId,
				pid: run.pid,
				status: run.status,
				logFile: run.paths.logFile,
				eventsFile: run.paths.eventsFile,
			};
		}

		try {
			const totalStart = Date.now();
			if (!c.options.rebuild && !hasSnapshot(CONFIG_DIR, DEFAULT_SNAPSHOT_ID)) {
				console.log(
					`[init] Installing snapshot release ${c.options.snapshotVersion ?? "latest"}...`,
				);
				const install = await installSnapshotRelease({
					composeFile: COMPOSE_FILE,
					configDir: CONFIG_DIR,
					...(c.options.snapshotVersion ? { version: c.options.snapshotVersion } : {}),
				});
				console.log(
					`[init] Installed snapshot ${install.releaseTag ?? install.archiveName} from ${install.sourceUrl}`,
				);
			}
			const shouldRestoreSnapshot =
				!c.options.rebuild && hasSnapshot(CONFIG_DIR, DEFAULT_SNAPSHOT_ID);

			if (shouldRestoreSnapshot) {
				console.log(`[init] Restoring snapshot: ${DEFAULT_SNAPSHOT_ID}`);
				stopRuntime({
					composeFile: COMPOSE_FILE,
					projectName: "arbitrum-testnode",
					configDir: CONFIG_DIR,
				});
				restoreSnapshot(CONFIG_DIR, DEFAULT_SNAPSHOT_ID);
				startRunLoggingFromEnv(CONFIG_DIR) ??
					startInlineRunLogging(
						CONFIG_DIR,
						c.options.foreground ? ["init", "--foreground"] : ["init"],
					);
				anvilProcess = startAnvilWithState(CONFIG_DIR);
				await waitForRpc(L1_RPC);
				await startNitroFromSnapshot(
					{
						composeFile: COMPOSE_FILE,
						projectName: "arbitrum-testnode",
						configDir: CONFIG_DIR,
					},
					{ l1: L1_RPC, l2: L2_RPC, l3: L3_RPC },
				);
				await verifySnapshotSemanticState(CONFIG_DIR, {
					l1: L1_RPC,
					l2: L2_RPC,
					l3: L3_RPC,
				});

				const totalElapsed = Date.now() - totalStart;
				finishActiveRun("completed", { exitCode: 0 });
				return {
					success: true,
					restoredSnapshot: DEFAULT_SNAPSHOT_ID,
					totalSeconds: totalElapsed / 1000,
				};
			}

			startRunLoggingFromEnv(CONFIG_DIR) ??
				startInlineRunLogging(
					CONFIG_DIR,
					c.options.foreground ? ["init", "--foreground"] : ["init"],
				);
			const result = await runInitLoop();
			const totalElapsed = Date.now() - totalStart;

			if (result.timings) {
				console.log("\n[init] Timeline:");
				for (const [step, ms] of Object.entries(result.timings)) {
					console.log(`  ${step}: ${(ms / 1000).toFixed(1)}s`);
				}
				console.log(`  TOTAL: ${(totalElapsed / 1000).toFixed(1)}s`);
			}

			if (!result.success) {
				finishActiveRun("failed", {
					exitCode: 1,
					...(result.error ? { error: result.error } : {}),
					...(result.failedStep ? { failedStep: result.failedStep } : {}),
				});
				return { success: false, failedStep: result.failedStep, error: result.error };
			}

			stopRuntime({
				composeFile: COMPOSE_FILE,
				projectName: "arbitrum-testnode",
				configDir: CONFIG_DIR,
			});
			const snapshot = captureSnapshot(CONFIG_DIR, COMPOSE_FILE, DEFAULT_SNAPSHOT_ID);
			anvilProcess = startAnvilWithState(CONFIG_DIR);
			await waitForRpc(L1_RPC);
			await startNitroFromSnapshot(
				{
					composeFile: COMPOSE_FILE,
					projectName: "arbitrum-testnode",
					configDir: CONFIG_DIR,
				},
				{ l1: L1_RPC, l2: L2_RPC, l3: L3_RPC },
			);
			await verifySnapshotSemanticState(CONFIG_DIR, {
				l1: L1_RPC,
				l2: L2_RPC,
				l3: L3_RPC,
			});
			finishActiveRun("completed", { exitCode: 0 });
			return {
				success: true,
				stepsCompleted: INIT_STEPS.length,
				totalSeconds: totalElapsed / 1000,
				snapshotId: snapshot.snapshotId,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			finishActiveRun("failed", { exitCode: 1, error: message });
			throw err;
		}
	},
});
