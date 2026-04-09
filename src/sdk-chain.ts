import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "./rpc.js";

interface CreateChainModule {
	createChain: (params: Record<string, unknown>) => Promise<CreateChainResult>;
}

export interface CreateChainDeployment {
	bridge: Address;
	inbox: Address;
	"sequencer-inbox": Address;
	"deployed-at": number;
	rollup: Address;
	"native-token": Address;
	"upgrade-executor": Address;
	"validator-utils"?: Address;
	"validator-wallet-creator": Address;
	"stake-token"?: Address;
}

export interface CreateChainResult {
	deployment: CreateChainDeployment;
	chainInfo: Array<Record<string, unknown>>;
	nodeConfig: Record<string, unknown>;
	rollupCreatorAddress: Address;
}

export interface DeployRollupViaSdkParams {
	configDir: string;
	chainConfigPath: string;
	chainId: number;
	chainName: string;
	parentChainId: number;
	parentChainIsArbitrum: boolean;
	parentRpcUrl: string;
	parentBeaconRpcUrl?: string;
	ownerAddress: Address;
	ownerKey: `0x${string}`;
	batchPosterAddress: Address;
	batchPosterKey: `0x${string}`;
	validatorAddress: Address;
	validatorKey: `0x${string}`;
	maxDataSize: bigint;
	wasmModuleRoot: `0x${string}`;
	deploymentOutputPath: string;
	chainInfoOutputPath: string;
	rawNodeConfigOutputPath: string;
	nativeToken?: Address;
	feeTokenPricer?: Address;
}

function getChainSdkEntryPath(): string {
	const override = process.env["ARBITRUM_CHAIN_SDK_ENTRY"];
	if (override) {
		return override;
	}

	return resolve(import.meta.dirname, "../../arbitrum-chain-sdk/src/dist/index.js");
}

async function loadCreateChainModule(): Promise<CreateChainModule> {
	const entryPath = getChainSdkEntryPath();
	if (!existsSync(entryPath)) {
		throw new Error(
			`Chain SDK build not found at ${entryPath}. Build ../arbitrum-chain-sdk first or set ARBITRUM_CHAIN_SDK_ENTRY.`,
		);
	}

	const moduleUrl = pathToFileURL(entryPath).href;
	const loaded = (await import(moduleUrl)) as {
		createChain?: CreateChainModule["createChain"];
		default?: { createChain?: CreateChainModule["createChain"] };
	};
	const createChain = loaded.createChain ?? loaded.default?.createChain;
	if (!createChain) {
		throw new Error(`createChain export not found in ${entryPath}`);
	}

	return { createChain };
}

export async function deployRollupViaSdk(params: DeployRollupViaSdkParams): Promise<CreateChainResult> {
	const chainConfig = JSON.parse(readFileSync(params.chainConfigPath, "utf-8")) as Record<
		string,
		unknown
	>;
	const account = privateKeyToAccount(params.ownerKey);
	const { createChain } = await loadCreateChainModule();

	const result = await createChain({
		account,
		parentChainPublicClient: publicClient(params.parentRpcUrl),
		chainId: params.chainId,
		chainName: params.chainName,
		owner: params.ownerAddress,
		batchPoster: params.batchPosterAddress,
		batchPosterPrivateKey: params.batchPosterKey,
		validator: params.validatorAddress,
		validatorPrivateKey: params.validatorKey,
		parentChainId: params.parentChainId,
		parentChainIsArbitrum: params.parentChainIsArbitrum,
		parentChainRpcUrl: params.parentRpcUrl,
		...(params.parentBeaconRpcUrl ? { parentChainBeaconRpcUrl: params.parentBeaconRpcUrl } : {}),
		chainConfig,
		maxDataSize: params.maxDataSize,
		wasmModuleRoot: params.wasmModuleRoot,
		// omit stakeToken — createChain defaults to WETH for non-custom chains
		...(params.nativeToken ? { nativeToken: params.nativeToken } : {}),
		...(params.feeTokenPricer ? { feeTokenPricer: params.feeTokenPricer } : {}),
	});

	const deploymentWithCreator = {
		...result.deployment,
		'rollup-creator': result.rollupCreatorAddress,
	};
	writeFileSync(params.deploymentOutputPath, JSON.stringify(deploymentWithCreator, null, 2));
	writeFileSync(params.chainInfoOutputPath, JSON.stringify(result.chainInfo, null, 2));
	writeFileSync(params.rawNodeConfigOutputPath, JSON.stringify(result.nodeConfig, null, 2));

	return result;
}
