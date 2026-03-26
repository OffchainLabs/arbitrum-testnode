import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { accounts } from "./accounts.js";
import {
	ZERO_ADDRESS,
	createChainSpec,
	createParentDeployment,
	getAdminOutputDir,
	getChainSpecPath,
	readDeploymentArtifact,
	writeChainSpecFile,
	writeCombinedLocalNetworkFile,
	writeSdkNetworkFileFromBridgeUiConfig,
} from "./chain-spec.js";
import { clampDepositAmount } from "./deposit-amount.js";
import { execOrThrow } from "./exec.js";
import {
	arbOwnerAbi,
	getBalanceWei as getBalanceWeiRpc,
	readContractOrZero,
	rollupAbi,
	walletClient,
} from "./rpc.js";

const ARB_OWNER = "0x0000000000000000000000000000000000000070" as const;
function getAdminCliEntry(): string {
	const entry = process.env["ARBITRUM_ADMIN_CLI_ENTRY"];
	if (!entry) {
		throw new Error("ARBITRUM_ADMIN_CLI_ENTRY env var is required");
	}
	return entry;
}
const ADMIN_CLI_NODE_BIN = (() => {
	if (process.env["ARBITRUM_ADMIN_NODE_BIN"]) {
		return process.env["ARBITRUM_ADMIN_NODE_BIN"];
	}
	const node20Path = `${process.env["HOME"] ?? ""}/.nvm/versions/node/v20.19.0/bin/node`;
	return existsSync(node20Path) ? node20Path : "node";
})();
const NODE20_BIN_DIR = ADMIN_CLI_NODE_BIN === "node" ? null : dirname(ADMIN_CLI_NODE_BIN);
const LOCAL_TOKEN_BRIDGE_DIR =
	process.env["TOKEN_BRIDGE_LOCAL_DIR"] ??
	resolve(import.meta.dirname, "../../token-bridge-contracts");
const SDK_LOCAL_NETWORK_PATH =
	process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"] ??
	resolve(import.meta.dirname, "../../arbitrum-sdk/packages/sdk/localNetwork.json");
const PORTAL_LOCAL_NETWORK_PATH =
	process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"] ??
	resolve(
		import.meta.dirname,
		"../../arbitrum-portal/packages/arb-token-bridge-ui/src/util/networksNitroTestnode.generated.json",
	);
const BRIDGE_DEPLOY_TIMEOUT_MS = 300_000;
const FUNDING_RESERVE_WEI = 1n * 10n ** 18n;
const L2_L3_FACTORY_GAS_LIMIT = "10000000";
const TOKENBRIDGE_DEPLOYER_TARGET_L1_WEI = 100n * 10n ** 18n;
const TOKENBRIDGE_DEPLOYER_TARGET_L2_WEI = 100n * 10n ** 18n;
const TOKENBRIDGE_DEPLOYER_TARGET_L3_WEI = 10n * 10n ** 18n;

export interface ComposeContext {
	composeFile: string;
	projectName: string;
}

interface BridgeDeployParams {
	compose: ComposeContext;
	configDir: string;
	rollupAddress: string;
	rollupOwnerKey: string;
	parentRpc: string;
	childRpc: string;
	parentKey: string;
	childKey: string;
	parentWethOverride?: string;
}

interface L1L2NetworkFile {
	l2Network?: {
		tokenBridge?: {
			childWeth?: string;
		};
	};
}

interface L2L3NetworkFile {
	l1TokenBridgeCreator?: string;
	tokenBridge?: {
		chain?: {
			upgradeExecutor?: string;
		};
	};
}

export function parseTokenBridgeCreatorAddress(output: string): string {
	const logicMatch = output.match(
		/L1AtomicTokenBridgeCreator created at address:\s+(0x[a-fA-F0-9]{40})/,
	);
	const logicAddress = logicMatch?.[1];
	if (logicAddress) {
		const proxyRegex = new RegExp(
			`TransparentUpgradeableProxy created at address:\\s+(0x[a-fA-F0-9]{40})\\s+${logicAddress}\\b`,
		);
		const proxyMatch = output.match(proxyRegex);
		const proxyAddress = proxyMatch?.[1];
		if (proxyAddress) {
			return proxyAddress;
		}
	}

	const matches = [...output.matchAll(/L1TokenBridgeCreator:?\s+(0x[a-fA-F0-9]{40})/g)];
	const match = matches.at(-1);
	if (!match) {
		throw new Error(`Failed to parse L1TokenBridgeCreator from output: ${output}`);
	}
	const creatorAddress = match[1];
	if (!creatorAddress) {
		throw new Error(`Failed to parse L1TokenBridgeCreator from output: ${output}`);
	}
	return creatorAddress;
}

function composeRunArgs(
	compose: ComposeContext,
	service: string,
	command: string[],
	options?: {
		build?: boolean;
		entrypoint?: string;
		env?: Record<string, string>;
	},
): string[] {
	const args = ["compose", "-f", compose.composeFile, "-p", compose.projectName, "run"];
	if (options?.build) {
		args.push("--build");
	}
	args.push("--rm");
	if (options?.entrypoint) {
		args.push("--entrypoint", options.entrypoint);
	}
	for (const [key, value] of Object.entries(options?.env ?? {})) {
		args.push("-e", `${key}=${value}`);
	}
	args.push(service, ...command);
	return args;
}

function runCompose(
	compose: ComposeContext,
	service: string,
	command: string[],
	options?: {
		build?: boolean;
		entrypoint?: string;
		env?: Record<string, string>;
		timeoutMs?: number;
	},
): string {
	return execOrThrow("docker", composeRunArgs(compose, service, command, options), {
		timeout: options?.timeoutMs ?? BRIDGE_DEPLOY_TIMEOUT_MS,
	});
}

function runAdminCli(args: string[], timeoutMs = BRIDGE_DEPLOY_TIMEOUT_MS): string {
	const cliArgs = args.includes("--yes") ? args : ["--yes", ...args];
	return execOrThrow(ADMIN_CLI_NODE_BIN, [getAdminCliEntry(), ...cliArgs], {
		timeout: timeoutMs,
	});
}

async function getBalanceWei(address: Address, rpcUrl: string): Promise<bigint> {
	return getBalanceWeiRpc(address, rpcUrl);
}

async function topUpIfNeeded(
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
	const topUpWei = clampDepositAmount({
		balanceWei: senderBalanceWei,
		desiredWei: targetWei - currentBalanceWei,
		reserveWei: FUNDING_RESERVE_WEI,
	});

	console.log(`[init] Funding ${label} on ${rpcUrl} with ${topUpWei} wei`);
	const account = privateKeyToAccount(senderKey);
	const client = walletClient(rpcUrl, senderKey);
	await client.sendTransaction({
		account,
		to: address,
		value: topUpWei,
	});
}

function readL1L2Network(configDir: string): L1L2NetworkFile {
	return JSON.parse(readFileSync(join(configDir, "l1l2_network.json"), "utf-8")) as L1L2NetworkFile;
}

function readL2L3Network(configDir: string): L2L3NetworkFile {
	return JSON.parse(readFileSync(join(configDir, "l2l3_network.json"), "utf-8")) as L2L3NetworkFile;
}

function readL2ChildWeth(configDir: string): string {
	const childWeth = readL1L2Network(configDir).l2Network?.tokenBridge?.childWeth;
	if (!childWeth) {
		throw new Error("Missing l2Network.tokenBridge.childWeth in l1l2_network.json");
	}
	return childWeth;
}

function readL3UpgradeExecutor(configDir: string): string {
	const upgradeExecutor = readL2L3Network(configDir).tokenBridge?.chain?.upgradeExecutor;
	if (!upgradeExecutor) {
		throw new Error("Missing tokenBridge.chain.upgradeExecutor in l2l3_network.json");
	}
	return upgradeExecutor;
}

function toHostAccessibleRpcUrl(rpcUrl: string): string {
	switch (rpcUrl) {
		case "http://host.docker.internal:8545":
			return "http://127.0.0.1:8545";
		case "http://sequencer:8547":
		case "http://host.docker.internal:8547":
			return "http://127.0.0.1:8547";
		case "http://l3node:8547":
			return "http://127.0.0.1:8549";
		default:
			return rpcUrl;
	}
}

async function readAddressOrZero(
	contractAddress: Address,
	functionName: "outbox" | "rollupEventInbox" | "challengeManager",
	rpcUrl: string,
): Promise<string> {
	return readContractOrZero(contractAddress, rollupAbi, functionName, rpcUrl);
}

function deployTokenBridgeCreator(params: {
	compose: ComposeContext;
	parentRpc: string;
	parentKey: string;
	parentWeth?: string | undefined;
}): string {
	const requiresParentDeployGasOverride =
		params.parentRpc !== "http://host.docker.internal:8545" &&
		params.parentRpc !== "http://127.0.0.1:8545";
	const output = execOrThrow(
		"env",
		[
			...(NODE20_BIN_DIR ? [`PATH=${NODE20_BIN_DIR}:${process.env["PATH"] ?? ""}`] : []),
			`BASECHAIN_RPC=${toHostAccessibleRpcUrl(params.parentRpc)}`,
			`BASECHAIN_DEPLOYER_KEY=${params.parentKey}`,
			`BASECHAIN_WETH=${params.parentWeth ?? ""}`,
			...(requiresParentDeployGasOverride ? ["DEPLOY_GAS_LIMIT=50000000"] : []),
			"GAS_LIMIT_FOR_L2_FACTORY_DEPLOYMENT=10000000",
			"yarn",
			"deploy:token-bridge-creator",
		],
		{
			cwd: LOCAL_TOKEN_BRIDGE_DIR,
			timeout: 600_000,
		},
	);
	return parseTokenBridgeCreatorAddress(output);
}

function waitForCreatorSettlement(seconds = 10): void {
	execOrThrow("sleep", [String(seconds)], { timeout: (seconds + 1) * 1000 });
}

function deployChildChainFromSpec(
	specPath: string,
	configDir: string,
	privateKey: string,
	outputDirName: "l2" | "l3",
): void {
	mkdirSync(getAdminOutputDir(configDir, outputDirName), { recursive: true });
	const args = [
		"deploy",
		"child",
		"--config",
		specPath,
		"--private-key",
		privateKey,
		"--yes",
		"--output-dir",
		getAdminOutputDir(configDir, outputDirName),
	];
	try {
		runAdminCli(args, 600_000);
	} catch (error) {
		if (!shouldRetryChildDeploy(specPath, error)) {
			throw error;
		}
		console.warn("[init] Child deploy wrote partial state; retrying once");
		runAdminCli(args, 600_000);
	}
}

function shouldRetryChildDeploy(specPath: string, error: unknown): boolean {
	void specPath;
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("Unexpected status for retryable ticket") ||
		message.includes("already included") ||
		message.includes("inboxToL1Deployment") ||
		message.includes("inboxToL2Deployment") ||
		message.includes("l1TokenToGateway")
	);
}

function publishLocalNetworkArtifacts(configDir: string): void {
	const localNetworkPath = join(configDir, "localNetwork.json");
	if (!existsSync(localNetworkPath)) {
		return;
	}

	const localNetwork = readFileSync(localNetworkPath, "utf-8");
	for (const targetPath of [SDK_LOCAL_NETWORK_PATH, PORTAL_LOCAL_NETWORK_PATH]) {
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, localNetwork);
	}
}

async function setL3ChainOwners(l3RpcUrl: string, upgradeExecutorAddress: Address): Promise<void> {
	const l3OwnerAccount = privateKeyToAccount(accounts.l3owner.privateKey);
	const client = walletClient(l3RpcUrl, accounts.l3owner.privateKey);
	await client.writeContract({
		account: l3OwnerAccount,
		address: ARB_OWNER,
		abi: arbOwnerAbi,
		functionName: "addChainOwner",
		args: [upgradeExecutorAddress],
	});

	await client.writeContract({
		account: l3OwnerAccount,
		address: ARB_OWNER,
		abi: arbOwnerAbi,
		functionName: "removeChainOwner",
		args: [accounts.l3owner.address],
	});
}

export async function ensureL1L2TokenBridgeFunding(
	l1RpcUrl: string,
	l2RpcUrl: string,
): Promise<void> {
	await topUpIfNeeded(
		accounts.funnel.address,
		TOKENBRIDGE_DEPLOYER_TARGET_L1_WEI,
		l1RpcUrl,
		accounts.funnel.privateKey,
		"tokenbridge deployer on L1",
	);
	await topUpIfNeeded(
		accounts.funnel.address,
		TOKENBRIDGE_DEPLOYER_TARGET_L2_WEI,
		l2RpcUrl,
		accounts.funnel.privateKey,
		"tokenbridge deployer on L2",
	);
}

export async function ensureL2L3TokenBridgeFunding(
	l2RpcUrl: string,
	l3RpcUrl: string,
): Promise<void> {
	await topUpIfNeeded(
		accounts.userTokenBridgeDeployer.address,
		TOKENBRIDGE_DEPLOYER_TARGET_L2_WEI,
		l2RpcUrl,
		accounts.funnel.privateKey,
		"tokenbridge deployer on L2",
	);
	await topUpIfNeeded(
		accounts.userTokenBridgeDeployer.address,
		TOKENBRIDGE_DEPLOYER_TARGET_L3_WEI,
		l3RpcUrl,
		accounts.funnel.privateKey,
		"tokenbridge deployer on L3",
	);
}

export async function deployL1L2TokenBridge(params: BridgeDeployParams): Promise<void> {
	const specPath = getChainSpecPath(params.configDir, "l2");
	const parentRpc = toHostAccessibleRpcUrl(params.parentRpc);
	const childRpc = toHostAccessibleRpcUrl(params.childRpc);
	const l2Deployment = readDeploymentArtifact(params.configDir, "l2_deployment.json");
	const tokenBridgeCreator = deployTokenBridgeCreator({
		compose: params.compose,
		parentRpc: params.parentRpc,
		parentKey: params.parentKey,
		parentWeth: l2Deployment["stake-token"] ?? ZERO_ADDRESS,
	});
	waitForCreatorSettlement();
	const rollupAddress = params.rollupAddress as Address;
	const spec = createChainSpec({
		chainName: "arb-dev-test",
		chainId: 412346,
		parentChainId: 1337,
		parentRpc,
		chainRpc: childRpc,
		tokenBridgeCreator,
		parentDeployment: createParentDeployment({
			deployment: l2Deployment,
			outbox: await readAddressOrZero(rollupAddress, "outbox", parentRpc),
			rollupEventInbox: await readAddressOrZero(rollupAddress, "rollupEventInbox", parentRpc),
			challengeManager: await readAddressOrZero(rollupAddress, "challengeManager", parentRpc),
		}),
		owner: accounts.l2owner.address,
	});
	writeChainSpecFile(specPath, spec);
	deployChildChainFromSpec(specPath, params.configDir, params.rollupOwnerKey, "l2");
	writeSdkNetworkFileFromBridgeUiConfig(
		params.configDir,
		getAdminOutputDir(params.configDir, "l2"),
		"l1l2_network.json",
		"l2Network",
	);
	writeCombinedLocalNetworkFile(params.configDir);
	publishLocalNetworkArtifacts(params.configDir);
}

export async function deployL2L3TokenBridge(params: BridgeDeployParams): Promise<void> {
	const specPath = getChainSpecPath(params.configDir, "l3");
	const parentRpc = toHostAccessibleRpcUrl(params.parentRpc);
	const childRpc = toHostAccessibleRpcUrl(params.childRpc);
	const tokenBridgeCreator = deployTokenBridgeCreator({
		compose: params.compose,
		parentRpc: params.parentRpc,
		parentKey: params.parentKey,
		parentWeth: params.parentWethOverride,
	});
	waitForCreatorSettlement();
	const rollupAddress = params.rollupAddress as Address;
	const spec = createChainSpec({
		chainName: "orbit-dev-test",
		chainId: 333333,
		parentChainId: 412346,
		parentRpc,
		chainRpc: childRpc,
		tokenBridgeCreator,
		parentDeployment: createParentDeployment({
			deployment: readDeploymentArtifact(params.configDir, "l3_deployment.json"),
			outbox: await readAddressOrZero(rollupAddress, "outbox", parentRpc),
			rollupEventInbox: await readAddressOrZero(rollupAddress, "rollupEventInbox", parentRpc),
			challengeManager: await readAddressOrZero(rollupAddress, "challengeManager", parentRpc),
		}),
		ownership: {
			addChainOwners: [
				readDeploymentArtifact(params.configDir, "l3_deployment.json")["upgrade-executor"],
			],
			removeDeployer: true,
		},
		owner: accounts.l3owner.address,
	});
	writeChainSpecFile(specPath, spec);
	deployChildChainFromSpec(specPath, params.configDir, params.rollupOwnerKey, "l3");
	writeSdkNetworkFileFromBridgeUiConfig(
		params.configDir,
		getAdminOutputDir(params.configDir, "l3"),
		"l2l3_network.json",
		"l3Network",
	);
	writeCombinedLocalNetworkFile(params.configDir);
	publishLocalNetworkArtifacts(params.configDir);
}

export async function transferL3ChainOwnership(
	configDir: string,
	_l2RpcUrl: string,
	l3RpcUrl: string,
): Promise<void> {
	const upgradeExecutor = readL3UpgradeExecutor(configDir);
	await setL3ChainOwners(l3RpcUrl, upgradeExecutor as Address);
}

export function getL2ChildWeth(configDir: string): string {
	return readL2ChildWeth(configDir);
}
