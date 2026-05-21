import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DEFAULT_TESTNODE_IMAGE_REPOSITORY = "ghcr.io/offchainlabs/arbitrum-testnode";

export const NITRO_CONTRACTS_VERSIONS = {
	"v2.1": { tagComponent: "nc2.1" },
	"v3.2": { tagComponent: "nc3.2" },
};

export const DEFAULT_NITRO_CONTRACTS_VERSION = "v3.2";

const DEFAULT_VARIANT_CATALOG_PATH = new URL("../../../config/variants.json", import.meta.url);

function loadVariantCatalog(path = DEFAULT_VARIANT_CATALOG_PATH) {
	const catalog = JSON.parse(readFileSync(path, "utf-8"));
	if (!Array.isArray(catalog.variants) || catalog.variants.length === 0) {
		throw new Error("variant catalog must contain at least one variant");
	}
	const entries = {};
	for (const entry of catalog.variants) {
		if (!entry.name || !entry.snapshotId) {
			throw new Error("variant catalog entries require name and snapshotId");
		}
		if (entries[entry.name]) {
			throw new Error(`Duplicate variant catalog entry: ${entry.name}`);
		}
		entries[entry.name] = entry;
	}
	return entries;
}

export const VARIANTS = loadVariantCatalog();

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

export function normalizeNitroContractsVersion(value) {
	const v = value || DEFAULT_NITRO_CONTRACTS_VERSION;
	if (!NITRO_CONTRACTS_VERSIONS[v]) {
		throw new Error(
			`nitro-contracts-version must be one of: ${Object.keys(NITRO_CONTRACTS_VERSIONS).join(", ")}`,
		);
	}
	return v;
}

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
	return `${repository}:${version}-${NITRO_CONTRACTS_VERSIONS[cv].tagComponent}-${definition.name}`;
}

export function defaultActionOutputDir({ runnerTemp, variant, version }) {
	if (!runnerTemp) {
		throw new Error("RUNNER_TEMP is required when output-dir is not provided");
	}
	return join(runnerTemp, "arbitrum-testnode", version, variant);
}

export function defaultStartOutputDir({ cwd, variant, version }) {
	return join(cwd, ".arbitrum-testnode", version, variant);
}

function sanitizeContainerName(value) {
	return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

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
			version,
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
		args.push("-p", `127.0.0.1:${hostPorts.l3}:8549`);
		args.push("-p", `127.0.0.1:${hostPorts.l3Ws}:8550`);
	}
	args.push(state.imageRef);
	return args;
}

export function runDocker(args, options = {}) {
	return execFileSync("docker", args, {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
}

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

export function removeContainer(containerName) {
	try {
		runDocker(["rm", "-f", containerName]);
	} catch {
		// ignore missing container
	}
}

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

export function copyNetworkConfigPaths(sourcePath, destinations) {
	for (const dest of destinations) {
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(sourcePath, dest);
	}
}
