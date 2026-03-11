import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const FAST_PARENT_ROLLUP_CONFIG = {
	minimumAssertionPeriod: "1",
	confirmPeriodBlocks: "1",
} as const;

export interface DeploymentJson {
	rollup: string;
	inbox: string;
	bridge: string;
	"sequencer-inbox": string;
	"upgrade-executor": string;
	"validator-wallet-creator"?: string;
	"native-token"?: string;
	"deployed-at"?: number;
	"stake-token"?: string;
}

export interface AccountKeyMaterial {
	address: string;
	privateKey: string;
}

export interface ChainSpecParentDeployment {
	rollup: string;
	inbox: string;
	outbox: string;
	bridge: string;
	sequencerInbox: string;
	rollupEventInbox: string;
	challengeManager: string;
	adminProxy: string;
	upgradeExecutor: string;
	validatorWalletCreator: string;
	nativeToken: string;
	deployedAtBlockNumber: number;
	transactionHash: string;
	keys?: {
		batchPoster: AccountKeyMaterial;
		validator: AccountKeyMaterial;
	};
	walletsFunded: true;
	completedSteps: ["rollup", "fundWallets"];
}

export interface ChainSpecFile {
	chainName: string;
	chainId: number;
	parentChain: {
		rpc: string;
		chainId: number;
	};
	chain: {
		rpc: string;
	};
	deployment: {
		owner: string;
		arbosVersion: number;
		tokenBridgeCreator?: string;
	};
	parentRollupConfig: typeof FAST_PARENT_ROLLUP_CONFIG;
	ownership?: {
		addChainOwners: string[];
		removeDeployer: boolean;
	};
	parentDeployment: ChainSpecParentDeployment;
	childDeployment?: Record<string, unknown>;
}

export interface BridgeUiConfigFile {
	chainName: string;
	parentChainId: number;
	chainId: number;
	rollup: string;
	parentChainRpc: string;
	chainRpc: string;
	nativeToken: string;
	coreContracts: {
		bridge: string;
		inbox: string;
		outbox: string;
		sequencerInbox: string;
		rollup: string;
	};
	tokenBridge: {
		parentChain: {
			router: string;
			standardGateway: string;
			customGateway: string;
			wethGateway: string;
			weth: string;
			multicall: string;
			proxyAdmin?: string;
		};
		chain: {
			router: string;
			standardGateway: string;
			customGateway: string;
			wethGateway: string;
			weth: string;
			multicall: string;
			proxyAdmin?: string;
		};
	};
}

type SdkNetworkKey = "l2Network" | "l3Network";

interface SdkNetworkFile {
	l2Network?: Record<string, unknown>;
	l3Network?: Record<string, unknown>;
}

export function getChainSpecPath(configDir: string, name: "l2" | "l3"): string {
	return join(configDir, name === "l2" ? "l1-l2-chain-config.json" : "l2-l3-chain-config.json");
}

export function getAdminOutputDir(configDir: string, name: "l2" | "l3"): string {
	return join(configDir, name === "l2" ? "l1-l2-admin" : "l2-l3-admin");
}

export function readDeploymentArtifact(configDir: string, name: string): DeploymentJson {
	return JSON.parse(readFileSync(join(configDir, name), "utf-8")) as DeploymentJson;
}

export function createParentDeployment(input: {
	deployment: DeploymentJson;
	outbox: string;
	rollupEventInbox: string;
	challengeManager: string;
	adminProxy?: string;
	batchPoster?: AccountKeyMaterial;
	validator?: AccountKeyMaterial;
}): ChainSpecParentDeployment {
	return {
		rollup: input.deployment["rollup"],
		inbox: input.deployment["inbox"],
		outbox: input.outbox,
		bridge: input.deployment["bridge"],
		sequencerInbox: input.deployment["sequencer-inbox"],
		rollupEventInbox: input.rollupEventInbox,
		challengeManager: input.challengeManager,
		adminProxy: input.adminProxy ?? ZERO_ADDRESS,
		upgradeExecutor: input.deployment["upgrade-executor"],
		validatorWalletCreator: input.deployment["validator-wallet-creator"] ?? ZERO_ADDRESS,
		nativeToken: input.deployment["native-token"] ?? ZERO_ADDRESS,
		deployedAtBlockNumber: input.deployment["deployed-at"] ?? 0,
		transactionHash: "0x",
		...(input.batchPoster && input.validator
			? {
					keys: {
						batchPoster: input.batchPoster,
						validator: input.validator,
					},
				}
			: {}),
		walletsFunded: true,
		completedSteps: ["rollup", "fundWallets"],
	};
}

export function createChainSpec(input: {
	chainName: string;
	chainId: number;
	parentChainId: number;
	parentRpc: string;
	chainRpc: string;
	owner: string;
	arbosVersion?: number;
	tokenBridgeCreator?: string;
	parentDeployment: ChainSpecParentDeployment;
	ownership?: ChainSpecFile["ownership"];
}): ChainSpecFile {
	return {
		chainName: input.chainName,
		chainId: input.chainId,
		parentChain: {
			rpc: input.parentRpc,
			chainId: input.parentChainId,
		},
		chain: {
			rpc: input.chainRpc,
		},
		deployment: {
			owner: input.owner,
			arbosVersion: input.arbosVersion ?? 40,
			...(input.tokenBridgeCreator ? { tokenBridgeCreator: input.tokenBridgeCreator } : {}),
		},
		parentRollupConfig: FAST_PARENT_ROLLUP_CONFIG,
		...(input.ownership ? { ownership: input.ownership } : {}),
		parentDeployment: input.parentDeployment,
	};
}

export function writeChainSpecFile(path: string, spec: ChainSpecFile): void {
	mkdirSync(dirname(path), { recursive: true });
	let existing: Partial<ChainSpecFile> = {};
	try {
		existing = JSON.parse(readFileSync(path, "utf-8")) as Partial<ChainSpecFile>;
	} catch {
		// no existing config or invalid JSON, overwrite with fresh spec
	}

	const merged: ChainSpecFile = {
		...existing,
		...spec,
		deployment: {
			...(existing.deployment ?? {}),
			...spec.deployment,
		},
		parentDeployment: {
			...(existing.parentDeployment ?? {}),
			...spec.parentDeployment,
		},
		...(existing.childDeployment ? { childDeployment: existing.childDeployment } : {}),
	};

	writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
}

export function writeSdkNetworkFileFromBridgeUiConfig(
	configDir: string,
	outputDir: string,
	destName: string,
	networkKey: SdkNetworkKey,
): void {
	const bridgeUiConfigPath = join(outputDir, "bridgeUiConfig.json");
	const bridgeUiConfig = JSON.parse(
		readFileSync(bridgeUiConfigPath, "utf-8"),
	) as BridgeUiConfigFile;
	const tokenBridge = bridgeUiConfig.tokenBridge;
	const network = {
		parentChainId: bridgeUiConfig.parentChainId,
		chainId: bridgeUiConfig.chainId,
		confirmPeriodBlocks: Number(FAST_PARENT_ROLLUP_CONFIG.confirmPeriodBlocks),
		ethBridge: {
			bridge: bridgeUiConfig.coreContracts.bridge,
			inbox: bridgeUiConfig.coreContracts.inbox,
			outbox: bridgeUiConfig.coreContracts.outbox,
			rollup: bridgeUiConfig.rollup,
			sequencerInbox: bridgeUiConfig.coreContracts.sequencerInbox,
		},
		isCustom: true,
		name: bridgeUiConfig.chainName,
		retryableLifetimeSeconds: 7 * 24 * 60 * 60,
		isTestnet: true,
		...(bridgeUiConfig.nativeToken !== ZERO_ADDRESS
			? { nativeToken: bridgeUiConfig.nativeToken }
			: {}),
		tokenBridge: {
			parentCustomGateway: tokenBridge.parentChain.customGateway,
			parentErc20Gateway: tokenBridge.parentChain.standardGateway,
			parentGatewayRouter: tokenBridge.parentChain.router,
			parentMultiCall: tokenBridge.parentChain.multicall,
			...(tokenBridge.parentChain.proxyAdmin
				? { parentProxyAdmin: tokenBridge.parentChain.proxyAdmin }
				: {}),
			parentWeth: tokenBridge.parentChain.weth,
			parentWethGateway: tokenBridge.parentChain.wethGateway,
			childCustomGateway: tokenBridge.chain.customGateway,
			childErc20Gateway: tokenBridge.chain.standardGateway,
			childGatewayRouter: tokenBridge.chain.router,
			childMultiCall: tokenBridge.chain.multicall,
			...(tokenBridge.chain.proxyAdmin
				? { childProxyAdmin: tokenBridge.chain.proxyAdmin }
				: {}),
			childWeth: tokenBridge.chain.weth,
			childWethGateway: tokenBridge.chain.wethGateway,
		},
	};
	const next = {
		[networkKey]: network,
	};
	writeFileSync(join(configDir, destName), `${JSON.stringify(next, null, 2)}\n`);
}

function readOptionalSdkNetworkFile(path: string): SdkNetworkFile {
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as SdkNetworkFile;
	} catch {
		return {};
	}
}

export function writeCombinedLocalNetworkFile(configDir: string): void {
	const l1l2Network = readOptionalSdkNetworkFile(join(configDir, "l1l2_network.json"));
	const l2l3Network = readOptionalSdkNetworkFile(join(configDir, "l2l3_network.json"));
	const next: SdkNetworkFile = {};

	if (l1l2Network.l2Network) {
		next.l2Network = l1l2Network.l2Network;
	}
	if (l2l3Network.l3Network) {
		next.l3Network = l2l3Network.l3Network;
	}

	writeFileSync(join(configDir, "localNetwork.json"), `${JSON.stringify(next, null, 2)}\n`);
}
