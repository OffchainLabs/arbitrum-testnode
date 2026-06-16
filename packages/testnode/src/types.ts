export type ScalarInput = number | string | boolean | undefined;

export interface VariantDefinition {
	description?: string;
	name: string;
	hostPorts: { l1: number; l2: number; l2Ws: number; l3?: number; l3Ws?: number };
	l3Enabled: boolean;
	snapshotId: string;
	timeboostEnabled?: boolean;
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
	rpcUrls: { l1: string; l2: string; l3: string };
	snapshotId: string;
	timeboostEnabled: boolean;
	variant: string;
	variantDefinition: VariantDefinition;
}

export interface BaseStateOptions {
	containerName?: string | undefined;
	contractsVersion?: string | undefined;
	feeTokenDecimals?: number | string | undefined;
	imageRepository?: string | undefined;
	l3Enabled?: boolean | string | undefined;
	outputDir?: string | undefined;
	timeboostEnabled?: boolean | string | undefined;
	version: string;
}

export type ActionStateOptions = BaseStateOptions & {
	runnerTemp?: string | undefined;
	workspace?: string | undefined;
};

export type StartStateOptions = BaseStateOptions & { cwd: string };

export interface ImageRefOptions {
	contractsVersion?: string | undefined;
	imageRepository?: string | undefined;
	variant: string;
	version: string;
}

export interface ContainerDiagnostics {
	inspect?: string;
	logs?: string;
	errors: string[];
}
