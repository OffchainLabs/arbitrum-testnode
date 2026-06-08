// @ts-check

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * @typedef {import("./types.js").ActionStateOptions} ActionStateOptions
 * @typedef {import("./types.js").BaseStateOptions} BaseStateOptions
 * @typedef {import("./types.js").ContainerDiagnostics} ContainerDiagnostics
 * @typedef {import("./types.js").ImageRefOptions} ImageRefOptions
 * @typedef {import("./types.js").ScalarInput} ScalarInput
 * @typedef {import("./types.js").StartStateOptions} StartStateOptions
 * @typedef {import("./types.js").TestnodeState} TestnodeState
 * @typedef {import("./types.js").VariantDefinition} VariantDefinition
 */

export const DEFAULT_TESTNODE_IMAGE_REPOSITORY = "ghcr.io/offchainlabs/arbitrum-testnode-ci";

export const NITRO_CONTRACTS_VERSIONS = {
	"v2.1": { tagComponent: "nc2.1" },
	"v3.2": { tagComponent: "nc3.2" },
};

export const DEFAULT_NITRO_CONTRACTS_VERSION = "v3.2";

/** @type {Record<string, VariantDefinition>} */
export const VARIANTS = {
	l2: {
		name: "l2",
		description: "L1 + L2 testnode",
		snapshotId: "l2",
		l3Enabled: false,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
		},
	},
	"l3-eth": {
		name: "l3-eth",
		description: "L1 + L2 + L3 testnode with ETH gas on L3",
		snapshotId: "default",
		l3Enabled: true,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
	},
	"l3-custom-6": {
		name: "l3-custom-6",
		description: "L1 + L2 + L3 testnode with 6-decimal custom gas token on L3",
		snapshotId: "l3-custom-6",
		l3Enabled: true,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
	},
	"l3-custom-16": {
		name: "l3-custom-16",
		description: "L1 + L2 + L3 testnode with 16-decimal custom gas token on L3",
		snapshotId: "l3-custom-16",
		l3Enabled: true,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
	},
	"l3-custom-18": {
		name: "l3-custom-18",
		description: "L1 + L2 + L3 testnode with 18-decimal custom gas token on L3",
		snapshotId: "l3-custom-18",
		l3Enabled: true,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
	},
	"l3-custom-20": {
		name: "l3-custom-20",
		description: "L1 + L2 + L3 testnode with 20-decimal custom gas token on L3",
		snapshotId: "l3-custom-20",
		l3Enabled: true,
		hostPorts: {
			l1: 8545,
			l2: 8547,
			l2Ws: 8548,
			l3: 3347,
			l3Ws: 3348,
		},
	},
};

/**
 * @param {ScalarInput} value
 * @param {boolean} [defaultValue]
 */
function toBoolean(value, defaultValue = false) {
	if (value === undefined || value === "") {
		return defaultValue;
	}
	return value === true || value === "true";
}

/** @param {number | string | undefined} value */
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

/** @param {string | undefined} value */
export function normalizeNitroContractsVersion(value) {
	const v = value || DEFAULT_NITRO_CONTRACTS_VERSION;
	if (!(v in NITRO_CONTRACTS_VERSIONS)) {
		throw new Error(
			`nitro-contracts-version must be one of: ${Object.keys(NITRO_CONTRACTS_VERSIONS).join(", ")}`,
		);
	}
	return v;
}

/** @param {{ feeTokenDecimals?: number | string | undefined; l3Enabled?: boolean | string | undefined }} options */
export function resolveVariant({ feeTokenDecimals, l3Enabled }) {
	const enableL3 = toBoolean(l3Enabled);
	const decimals = normalizeFeeTokenDecimals(feeTokenDecimals);
	if (!enableL3 && decimals) {
		throw new Error("fee-token-decimals requires L3 to be enabled");
	}
	if (!enableL3) {
		return "l2";
	}
	if (!decimals) {
		return "l3-eth";
	}
	return `l3-custom-${decimals}`;
}

/** @param {ImageRefOptions} options */
export function buildTestnodeImageRef({ contractsVersion, imageRepository, variant, version }) {
	if (!version) {
		throw new Error("version is required");
	}
	const repository = imageRepository || DEFAULT_TESTNODE_IMAGE_REPOSITORY;
	const definition = VARIANTS[variant];
	if (!definition) {
		throw new Error(`Unknown variant ${variant}`);
	}
	const cv = normalizeNitroContractsVersion(contractsVersion);
	const contractsDefinition =
		NITRO_CONTRACTS_VERSIONS[/** @type {keyof typeof NITRO_CONTRACTS_VERSIONS} */ (cv)];
	return `${repository}:${version}-${contractsDefinition.tagComponent}-${definition.name}`;
}

/** @param {{ runnerTemp?: string | undefined; variant: string; version: string }} options */
export function defaultActionOutputDir({ runnerTemp, variant, version }) {
	if (!runnerTemp) {
		throw new Error("RUNNER_TEMP is required when output-dir is not provided");
	}
	return join(runnerTemp, "arbitrum-testnode", version, variant);
}

/** @param {{ cwd: string; variant: string; version: string }} options */
export function defaultStartOutputDir({ cwd, variant, version }) {
	return join(cwd, ".arbitrum-testnode", version, variant);
}

/** @param {string} value */
function sanitizeContainerName(value) {
	return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

/**
 * @param {BaseStateOptions & { defaultOutputDir: (options: { variant: string; version: string }) => string }} options
 * @returns {TestnodeState}
 */
function buildTestnodeState({
	containerName,
	contractsVersion,
	feeTokenDecimals,
	imageRepository,
	l3Enabled,
	outputDir,
	version,
	defaultOutputDir,
}) {
	const variant = resolveVariant({ feeTokenDecimals, l3Enabled });
	const definition = VARIANTS[variant];
	if (!definition) {
		throw new Error(`Unknown variant ${variant}`);
	}
	const resolvedContractsVersion = normalizeNitroContractsVersion(contractsVersion);
	const resolvedVersion = version;
	const resolvedOutputDir = outputDir ?? defaultOutputDir({ variant, version });
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
		contractsVersion: resolvedContractsVersion,
		imageRef: buildTestnodeImageRef({
			contractsVersion: resolvedContractsVersion,
			imageRepository,
			variant,
			version: resolvedVersion,
		}),
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

/** @param {ActionStateOptions} options */
export function buildActionTestnodeState({
	containerName,
	contractsVersion,
	feeTokenDecimals,
	imageRepository,
	l3Enabled,
	outputDir,
	runnerTemp,
	version,
	workspace,
}) {
	return buildTestnodeState({
		containerName,
		contractsVersion,
		feeTokenDecimals,
		imageRepository,
		l3Enabled,
		outputDir: outputDir
			? isAbsolute(outputDir)
				? outputDir
				: resolve(workspace || process.cwd(), outputDir)
			: undefined,
		version,
		defaultOutputDir: ({ variant, version: nextVersion }) =>
			defaultActionOutputDir({ runnerTemp, variant, version: nextVersion }),
	});
}

/** @param {StartStateOptions} options */
export function buildStartTestnodeState({
	containerName,
	contractsVersion,
	cwd,
	feeTokenDecimals,
	imageRepository,
	l3Enabled,
	outputDir,
	version,
}) {
	return buildTestnodeState({
		containerName,
		contractsVersion,
		feeTokenDecimals,
		imageRepository,
		l3Enabled,
		outputDir: outputDir
			? isAbsolute(outputDir)
				? outputDir
				: resolve(cwd, outputDir)
			: undefined,
		version,
		defaultOutputDir: ({ variant, version: nextVersion }) =>
			defaultStartOutputDir({ cwd, variant, version: nextVersion }),
	});
}

/** @param {TestnodeState} state */
export function testnodeDockerRunArgs(state) {
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
		"-p",
		"127.0.0.1:8080:8080",
	];
	if (state.variantDefinition.l3Enabled) {
		if (hostPorts.l3 === undefined || hostPorts.l3Ws === undefined) {
			throw new Error(`Variant ${state.variant} is missing L3 host ports`);
		}
		args.push("-p", `127.0.0.1:${hostPorts.l3}:8549`);
		args.push("-p", `127.0.0.1:${hostPorts.l3Ws}:8550`);
	}
	args.push(state.imageRef);
	return args;
}

/**
 * @param {string[]} args
 * @param {import("node:child_process").ExecFileSyncOptions} [options]
 * @returns {string}
 */
export function runDocker(args, options = {}) {
	return /** @type {string} */ (
		execFileSync("docker", args, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			...options,
		})
	);
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 */
export function waitForRpc(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_chainId", params: [] });
	while (Date.now() < deadline) {
		try {
			execFileSync(
				"curl",
				["-sf", "-X", "POST", "-H", "Content-Type: application/json", "-d", body, url],
				{ stdio: ["ignore", "pipe", "pipe"], timeout: 5000 },
			);
			return;
		} catch {
			// retry until deadline
		}
		execFileSync("sleep", ["1"], { stdio: "ignore" });
	}
	throw new Error(`RPC at ${url} not ready after ${timeoutMs}ms`);
}

/** @param {string} containerName */
export function removeContainer(containerName) {
	try {
		runDocker(["rm", "-f", containerName]);
	} catch {
		// ignore missing container
	}
}

/** @param {TestnodeState} state */
export function exportTestnodeConfig(state) {
	mkdirSync(state.configDir, { recursive: true });
	runDocker([
		"cp",
		`${state.containerName}:/opt/arbitrum-testnode/export-config/.`,
		state.configDir,
	]);
	const exported = readdirSync(state.configDir);
	if (exported.length === 0) {
		throw new Error(`No config files exported to ${state.configDir}`);
	}
	return exported;
}

/**
 * @param {TestnodeState} state
 * @param {number} timeoutMs
 */
export function bootTestnode(state, timeoutMs) {
	removeContainer(state.containerName);
	rmSync(state.outputDir, { force: true, recursive: true });
	mkdirSync(state.outputDir, { recursive: true });
	runDocker(testnodeDockerRunArgs(state));
	waitForRpc(state.rpcUrls.l1, timeoutMs);
	waitForRpc(state.rpcUrls.l2, timeoutMs);
	if (state.variantDefinition.l3Enabled) {
		waitForRpc(state.rpcUrls.l3, timeoutMs);
	}
	return exportTestnodeConfig(state);
}

/**
 * @param {string} containerName
 * @param {{ tailLines?: number }} [options]
 * @returns {ContainerDiagnostics}
 */
export function collectContainerDiagnostics(containerName, options = {}) {
	const diagnostics = /** @type {ContainerDiagnostics} */ ({ errors: [] });
	try {
		diagnostics.inspect = runDocker([
			"inspect",
			"--format",
			"{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}",
			containerName,
		]).trim();
	} catch (error) {
		diagnostics.errors.push(
			`inspect failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	try {
		const logs = runDocker(["logs", containerName]);
		diagnostics.logs = filterContainerLogs(logs, options.tailLines ?? 100);
	} catch (error) {
		diagnostics.errors.push(
			`log collection failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return diagnostics;
}

/**
 * @param {string} logs
 * @param {number} tailLines
 */
export function filterContainerLogs(logs, tailLines) {
	return logs
		.split(/\r?\n/)
		.filter((line) => !/Block Number|Block Hash|Block Time/.test(line))
		.slice(-tailLines)
		.join("\n");
}

/**
 * @param {string} sourcePath
 * @param {string[]} destinations
 */
export function copyNetworkConfigPaths(sourcePath, destinations) {
	for (const dest of destinations) {
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(sourcePath, dest);
	}
}
