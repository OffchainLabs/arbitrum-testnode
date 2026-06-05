import { readFileSync, writeFileSync } from "node:fs";
import {
	type NodeConfig,
	type PrepareNodeConfigParams,
	createRollup,
	createRollupPrepareDeploymentParamsConfig,
	prepareNodeConfig,
} from "@arbitrum/chain-sdk";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ZERO_ADDRESS } from "./init-helpers.js";
import { publicClient } from "./rpc.js";

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

export interface DeployRollupViaSdkParams {
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
	wasmModuleRoot?: `0x${string}`;
	deploymentOutputPath: string;
	chainInfoOutputPath: string;
	rawNodeConfigOutputPath: string;
	nativeToken?: Address;
	feeTokenPricer?: Address;
}

type DeploymentForNodeConfig = Partial<CreateChainDeployment> &
	Pick<CreateChainDeployment, "rollup" | "bridge" | "inbox" | "sequencer-inbox">;

export function prepareNodeConfigFromDeployment(input: {
	chainName: string;
	chainConfig: Record<string, unknown> & { chainId: number };
	deployment: DeploymentForNodeConfig;
	parentChainId: 1337 | 412346;
	parentChainIsArbitrum?: boolean;
	parentChainRpcUrl: string;
	parentChainBeaconRpcUrl?: string;
	batchPosterPrivateKey: string;
	validatorPrivateKey: string;
	dasServerUrl?: string;
}) {
	return prepareNodeConfig({
		chainName: input.chainName,
		chainConfig: input.chainConfig as PrepareNodeConfigParams["chainConfig"],
		coreContracts: {
			rollup: input.deployment.rollup,
			bridge: input.deployment.bridge,
			inbox: input.deployment.inbox,
			sequencerInbox: input.deployment["sequencer-inbox"],
			validatorUtils: input.deployment["validator-utils"],
			validatorWalletCreator: input.deployment["validator-wallet-creator"] ?? ZERO_ADDRESS,
			nativeToken: input.deployment["native-token"] ?? ZERO_ADDRESS,
			deployedAtBlockNumber: input.deployment["deployed-at"] ?? 0,
		} as PrepareNodeConfigParams["coreContracts"],
		batchPosterPrivateKey: input.batchPosterPrivateKey,
		validatorPrivateKey: input.validatorPrivateKey,
		stakeToken: input.deployment["stake-token"] ?? ZERO_ADDRESS,
		parentChainId: input.parentChainId,
		...(input.parentChainIsArbitrum !== undefined
			? { parentChainIsArbitrum: input.parentChainIsArbitrum }
			: {}),
		parentChainRpcUrl: input.parentChainRpcUrl,
		...(input.parentChainBeaconRpcUrl
			? { parentChainBeaconRpcUrl: input.parentChainBeaconRpcUrl }
			: {}),
		...(input.dasServerUrl ? { dasServerUrl: input.dasServerUrl } : {}),
	});
}

export async function deployRollupViaSdk(params: DeployRollupViaSdkParams): Promise<void> {
	const chainConfig = JSON.parse(readFileSync(params.chainConfigPath, "utf-8")) as Record<
		string,
		unknown
	>;
	const account = privateKeyToAccount(params.ownerKey);
	const parentChainPublicClient = publicClient(params.parentRpcUrl);
	const deploymentConfig = createRollupPrepareDeploymentParamsConfig(parentChainPublicClient, {
		chainId: BigInt(params.chainId),
		owner: params.ownerAddress,
		chainConfig: chainConfig as PrepareNodeConfigParams["chainConfig"],
		...(params.wasmModuleRoot ? { wasmModuleRoot: params.wasmModuleRoot } : {}),
		...(params.feeTokenPricer ? { feeTokenPricer: params.feeTokenPricer } : {}),
	});

	const result = await createRollup({
		params: {
			config: deploymentConfig,
			batchPosters: [params.batchPosterAddress],
			validators: [params.validatorAddress],
			maxDataSize: Number(params.maxDataSize),
			...(params.nativeToken ? { nativeToken: params.nativeToken } : {}),
		},
		account,
		parentChainPublicClient,
	});

	const stakeToken =
		((deploymentConfig as { stakeToken?: Address }).stakeToken as Address | undefined) ??
		ZERO_ADDRESS;
	const deployment: CreateChainDeployment = {
		bridge: result.coreContracts.bridge,
		inbox: result.coreContracts.inbox,
		"sequencer-inbox": result.coreContracts.sequencerInbox,
		"deployed-at": result.coreContracts.deployedAtBlockNumber,
		rollup: result.coreContracts.rollup,
		"native-token": result.coreContracts.nativeToken,
		"upgrade-executor": result.coreContracts.upgradeExecutor,
		...(result.coreContracts.validatorUtils
			? { "validator-utils": result.coreContracts.validatorUtils }
			: {}),
		"validator-wallet-creator": result.coreContracts.validatorWalletCreator,
		"stake-token": stakeToken,
	};
	const nodeConfig: NodeConfig = prepareNodeConfig({
		chainName: params.chainName,
		chainConfig: chainConfig as PrepareNodeConfigParams["chainConfig"],
		coreContracts: result.coreContracts,
		batchPosterPrivateKey: params.batchPosterKey,
		validatorPrivateKey: params.validatorKey,
		stakeToken,
		parentChainId: params.parentChainId as PrepareNodeConfigParams["parentChainId"],
		parentChainIsArbitrum: params.parentChainIsArbitrum,
		parentChainRpcUrl: params.parentRpcUrl,
		...(params.parentBeaconRpcUrl ? { parentChainBeaconRpcUrl: params.parentBeaconRpcUrl } : {}),
	});
	const deploymentWithCreator = {
		...deployment,
		"rollup-creator": result.transaction.to ?? ZERO_ADDRESS,
	};
	writeFileSync(params.deploymentOutputPath, JSON.stringify(deploymentWithCreator, null, 2));
	writeFileSync(
		params.chainInfoOutputPath,
		JSON.stringify(
			[
				{
					"chain-name": params.chainName,
					"parent-chain-id": params.parentChainId,
					"parent-chain-is-arbitrum": params.parentChainIsArbitrum,
					"sequencer-url": "",
					"secondary-forwarding-target": "",
					"feed-url": "",
					"secondary-feed-url": "",
					"das-index-url": "",
					"has-genesis-state": false,
					"chain-config": chainConfig,
					rollup: deployment,
				},
			],
			null,
			2,
		),
	);
	writeFileSync(params.rawNodeConfigOutputPath, JSON.stringify(nodeConfig, null, 2));
}
