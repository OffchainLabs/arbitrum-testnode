import { isAbsolute, join, resolve } from "node:path";

export const DEFAULT_IMAGE_REPOSITORY = "ghcr.io/offchainlabs/arbitrum-testnode-ci";

export const VARIANTS = {
	l2: {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
		},
		l3Enabled: false,
		snapshotId: "l2",
		tagSuffix: "l2",
	},
	"l3-custom-18": {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
		l3Enabled: true,
		snapshotId: "l3-custom-18",
		tagSuffix: "l3-custom-18",
	},
	"l3-custom-20": {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
		l3Enabled: true,
		snapshotId: "l3-custom-20",
		tagSuffix: "l3-custom-20",
	},
	"l3-custom-6": {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
		l3Enabled: true,
		snapshotId: "l3-custom-6",
		tagSuffix: "l3-custom-6",
	},
	"l3-custom-16": {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
		l3Enabled: true,
		snapshotId: "l3-custom-16",
		tagSuffix: "l3-custom-16",
	},
	"l3-eth": {
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
		l3Enabled: true,
		snapshotId: "default",
		tagSuffix: "l3-eth",
	},
};

function toBoolean(value, defaultValue = false) {
	if (value === undefined || value === "") {
		return defaultValue;
	}
	return value === true || value === "true";
}

function normalizeFeeTokenDecimals(value) {
	if (value === undefined || value === "") {
		return "";
	}
	const normalized = String(value);
	if (!["6", "16", "18", "20"].includes(normalized)) {
		throw new Error("fee-token-decimals must be one of 6, 16, 18, or 20");
	}
	return normalized;
}

export function resolveVariant({ feeTokenDecimals, l3Node }) {
	const enableL3 = toBoolean(l3Node);
	const decimals = normalizeFeeTokenDecimals(feeTokenDecimals);
	if (!enableL3 && decimals) {
		throw new Error("fee-token-decimals requires l3-node=true");
	}
	if (!enableL3) {
		return "l2";
	}
	if (!decimals) {
		return "l3-eth";
	}
	return `l3-custom-${decimals}`;
}

export function buildImageRef({ imageRepository, variant, version }) {
	if (!version) {
		throw new Error("version is required");
	}
	const repository = imageRepository || DEFAULT_IMAGE_REPOSITORY;
	const definition = VARIANTS[variant];
	if (!definition) {
		throw new Error(`Unknown variant ${variant}`);
	}
	return `${repository}:${version}-${definition.tagSuffix}`;
}

export function defaultOutputDir({ runnerTemp, variant, version }) {
	if (!runnerTemp) {
		throw new Error("RUNNER_TEMP is required when output-dir is not provided");
	}
	return join(runnerTemp, "arbitrum-testnode", version, variant);
}

function sanitizeContainerName(value) {
	return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export function buildActionState({
	containerName,
	feeTokenDecimals,
	imageRepository,
	l3Node,
	outputDir,
	runnerTemp,
	version,
	workspace,
}) {
	const variant = resolveVariant({ feeTokenDecimals, l3Node });
	const definition = VARIANTS[variant];
	if (!definition) {
		throw new Error(`Unknown variant ${variant}`);
	}
	const resolvedOutputDir = outputDir
		? isAbsolute(outputDir)
			? outputDir
			: resolve(workspace || process.cwd(), outputDir)
		: defaultOutputDir({ runnerTemp, variant, version });
	const resolvedContainerName = sanitizeContainerName(
		containerName || `arbitrum-testnode-${variant}`,
	);
	const configDir = join(resolvedOutputDir, "config");
	const rpcUrls = {
		l1: `http://127.0.0.1:${definition.hostPorts.l1}`,
		l2: `http://127.0.0.1:${definition.hostPorts.l2}`,
		l3: definition.l3Enabled ? `http://127.0.0.1:${definition.hostPorts.l3}` : "",
	};
	return {
		configDir,
		containerName: resolvedContainerName,
		imageRef: buildImageRef({ imageRepository, variant, version }),
		outputDir: resolvedOutputDir,
		paths: {
			l1BridgeUiConfig: join(configDir, "l1-l2-admin", "bridgeUiConfig.json"),
			l1l2Network: join(configDir, "l1l2_network.json"),
			l2BridgeUiConfig: definition.l3Enabled
				? join(configDir, "l2-l3-admin", "bridgeUiConfig.json")
				: "",
			l2l3Network: definition.l3Enabled ? join(configDir, "l2l3_network.json") : "",
			localNetwork: join(configDir, "localNetwork.json"),
		},
		rpcUrls,
		snapshotId: definition.snapshotId,
		variant,
		variantDefinition: definition,
	};
}

export function dockerRunArgs(state) {
	const { hostPorts } = state.variantDefinition;
	const args = [
		"run",
		"-d",
		"--name",
		state.containerName,
		"-e",
		`TESTNODE_VARIANT=${state.variant}`,
		"-p",
		`127.0.0.1:${hostPorts.l1}:8545`,
		"-p",
		`127.0.0.1:${hostPorts.l2}:8547`,
		"-p",
		`127.0.0.1:${hostPorts.l2Ws}:8548`,
	];
	if (state.variantDefinition.l3Enabled) {
		args.push("-p", `127.0.0.1:${hostPorts.l3}:8549`);
		args.push("-p", `127.0.0.1:${hostPorts.l3Ws}:8550`);
	}
	args.push(state.imageRef);
	return args;
}
