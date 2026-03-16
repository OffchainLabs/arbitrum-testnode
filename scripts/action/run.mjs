import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { buildActionState, dockerRunArgs } from "./lib.mjs";

function log(message) {
	console.log(`[arbitrum-testnode] ${message}`);
}

function writeEnv(key, value) {
	const envFile = process.env["GITHUB_ENV"];
	if (!envFile) {
		throw new Error("GITHUB_ENV is required");
	}
	appendFileSync(envFile, `${key}=${value}\n`);
}

function runDocker(args, options = {}) {
	return execFileSync("docker", args, {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
}

function waitForRpc(url, timeoutMs) {
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

const state = buildActionState({
	containerName: process.env["INPUT_CONTAINER_NAME"],
	feeTokenDecimals: process.env["INPUT_FEE_TOKEN_DECIMALS"],
	imageRepository: process.env["INPUT_IMAGE_REPOSITORY"],
	l3Node: process.env["INPUT_L3_NODE"],
	outputDir: process.env["INPUT_OUTPUT_DIR"],
	runnerTemp: process.env["RUNNER_TEMP"],
	version: process.env["INPUT_VERSION"],
	workspace: process.env["GITHUB_WORKSPACE"],
});
log(`variant=${state.variant} image=${state.imageRef}`);
log(`outputDir=${state.outputDir} configDir=${state.configDir}`);

const timeoutSeconds = Number(process.env["INPUT_STARTUP_TIMEOUT_SECONDS"] || "120");
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
	throw new Error("startup-timeout-seconds must be a positive number");
}
const timeoutMs = timeoutSeconds * 1000;

try {
	runDocker(["rm", "-f", state.containerName]);
} catch {
	// ignore missing container
}

rmSync(state.outputDir, { force: true, recursive: true });
mkdirSync(state.outputDir, { recursive: true });

try {
	log("starting container...");
	runDocker(dockerRunArgs(state));
	log(`waiting for L1 RPC at ${state.rpcUrls.l1}...`);
	waitForRpc(state.rpcUrls.l1, timeoutMs);
	log("L1 ready");
	log(`waiting for L2 RPC at ${state.rpcUrls.l2}...`);
	waitForRpc(state.rpcUrls.l2, timeoutMs);
	log("L2 ready");
	if (state.variantDefinition.l3Enabled) {
		log(`waiting for L3 RPC at ${state.rpcUrls.l3}...`);
		waitForRpc(state.rpcUrls.l3, timeoutMs);
		log("L3 ready");
	}
	log("exporting config...");
	mkdirSync(state.configDir, { recursive: true });
	runDocker([
		"cp",
		`${state.containerName}:/opt/arbitrum-testnode/export-config/.`,
		state.configDir,
	]);
	const exported = readdirSync(state.configDir);
	log(`exported ${exported.length} entries: ${exported.join(", ")}`);
	if (exported.length === 0) {
		throw new Error(`No config files exported to ${state.configDir}`);
	}
} catch (error) {
	log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
	try {
		const inspect = runDocker([
			"inspect",
			"--format",
			"{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}",
			state.containerName,
		]);
		log(`container state: ${inspect.trim()}`);
	} catch (e) {
		log(`inspect failed: ${e instanceof Error ? e.message : String(e)}`);
	}
	try {
		const logs = execFileSync(
			"sh",
			["-c", `docker logs ${state.containerName} 2>&1 | tail -80`],
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
		);
		log(`container logs:\n${logs}`);
	} catch (e) {
		log(`log collection failed: ${e instanceof Error ? e.message : String(e)}`);
	}
	process.exit(1);
}

writeEnv("ARBITRUM_PORTAL_LOCAL_NETWORK_PATH", state.paths.localNetwork);
writeEnv("ARBITRUM_SDK_LOCAL_NETWORK_PATH", state.paths.localNetwork);
writeEnv("ARBITRUM_TESTNODE_CONFIG_DIR", state.configDir);
writeEnv("ARBITRUM_TESTNODE_L1L2_NETWORK_PATH", state.paths.l1l2Network);
writeEnv("ARBITRUM_TESTNODE_L1_BRIDGE_UI_CONFIG_PATH", state.paths.l1BridgeUiConfig);
writeEnv("ARBITRUM_TESTNODE_L1_RPC_URL", state.rpcUrls.l1);
writeEnv("ARBITRUM_TESTNODE_L2L3_NETWORK_PATH", state.paths.l2l3Network);
writeEnv("ARBITRUM_TESTNODE_L2_BRIDGE_UI_CONFIG_PATH", state.paths.l2BridgeUiConfig);
writeEnv("ARBITRUM_TESTNODE_L2_RPC_URL", state.rpcUrls.l2);
writeEnv("ARBITRUM_TESTNODE_L3_RPC_URL", state.rpcUrls.l3);
writeEnv("ARBITRUM_TESTNODE_LOCAL_NETWORK_PATH", state.paths.localNetwork);
writeEnv("ARBITRUM_TESTNODE_VARIANT", state.variant);
writeEnv("ARBITRUM_TESTNODE_CONTAINER_NAME", state.containerName);
log("done");
