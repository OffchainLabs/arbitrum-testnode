export interface VariantDefinition {
	description?: string;
	name: string;
	hostPorts: {
		l1: number;
		l2: number;
		l2Ws: number;
		l3?: number;
		l3Ws?: number;
	};
	l3Enabled: boolean;
	snapshotId: string;
}

export interface TestnodeState {
	configDir: string;
	containerName: string;
	contractsVersion: string;
	imageRef: string;
	outputDir: string;
	paths: {
		l1BridgeUiConfig: string;
		l1l2Network: string;
		l2BridgeUiConfig: string;
		l2l3Network: string;
		localNetwork: string;
	};
	rpcUrls: {
		l1: string;
		l2: string;
		l3: string;
	};
	snapshotId: string;
	variant: string;
	variantDefinition: VariantDefinition;
}

export const DEFAULT_TESTNODE_IMAGE_REPOSITORY: string;
export const NITRO_CONTRACTS_VERSIONS: Record<string, { tagComponent: string }>;
export const DEFAULT_NITRO_CONTRACTS_VERSION: string;
export const VARIANTS: Record<string, VariantDefinition>;

export function normalizeNitroContractsVersion(value?: string): string;
export function resolveVariant(options: {
	feeTokenDecimals?: number | string | undefined;
	l3Enabled?: boolean | string | undefined;
}): string;
export function buildTestnodeImageRef(options: {
	contractsVersion?: string | undefined;
	imageRepository?: string | undefined;
	variant: string;
	version: string;
}): string;
export function defaultActionOutputDir(options: {
	runnerTemp: string;
	variant: string;
	version: string;
}): string;
export function defaultStartOutputDir(options: {
	cwd: string;
	variant: string;
	version: string;
}): string;
export function buildActionTestnodeState(options: {
	containerName?: string | undefined;
	contractsVersion?: string | undefined;
	feeTokenDecimals?: number | string | undefined;
	imageRepository?: string | undefined;
	l3Enabled?: boolean | string | undefined;
	outputDir?: string | undefined;
	runnerTemp?: string | undefined;
	version: string;
	workspace?: string | undefined;
}): TestnodeState;
export function buildStartTestnodeState(options: {
	containerName?: string | undefined;
	contractsVersion?: string | undefined;
	cwd: string;
	feeTokenDecimals?: number | string | undefined;
	imageRepository?: string | undefined;
	l3Enabled?: boolean | string | undefined;
	outputDir?: string | undefined;
	version: string;
}): TestnodeState;
export function testnodeDockerRunArgs(state: TestnodeState): string[];
export function runDocker(args: string[], options?: Record<string, unknown>): string;
export function waitForRpc(url: string, timeoutMs: number): void;
export function removeContainer(containerName: string): void;
export function exportTestnodeConfig(state: TestnodeState): string[];
export function bootTestnode(state: TestnodeState, timeoutMs: number): string[];
export function copyNetworkConfigPaths(sourcePath: string, destinations: string[]): void;
