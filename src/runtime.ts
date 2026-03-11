import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { composeDown, composeUp, waitForRpc } from "./docker.js";
import { exec } from "./exec.js";
import { getAnvilStateDir } from "./snapshot.js";

export interface RuntimeRpcs {
	l1: string;
	l2: string;
	l3: string;
}

export interface RuntimeOptions {
	composeFile: string;
	projectName: string;
	configDir: string;
}

const L1_HEARTBEAT_MARKER = "testnode-l1-heartbeat";

export function stopRuntime(options: RuntimeOptions): void {
	composeDown({ composeFile: options.composeFile, projectName: options.projectName });
	exec("docker", [
		"compose",
		"-f",
		options.composeFile,
		"-p",
		options.projectName,
		"down",
	]);
	exec("pkill", ["-f", "anvil.*--port.*8545"]);
	exec("pkill", ["-f", L1_HEARTBEAT_MARKER]);
}

export function startAnvilWithState(configDir: string): ChildProcess {
	const anvilProcess = spawn(
		"anvil",
		[
			"--host",
			"0.0.0.0",
			"--port",
			"8545",
			"--block-time",
			"1",
			"--accounts",
			"10",
			"--balance",
			"10000",
			"--chain-id",
			"1337",
			"--state",
			getAnvilStateDir(configDir),
		],
		{ stdio: "ignore", detached: true },
	);
	anvilProcess.unref();
	const heartbeatScript = `
/* ${L1_HEARTBEAT_MARKER} */
const rpcUrl = "http://127.0.0.1:8545";
const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_mine", params: [] });
const tick = async () => {
  try {
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
  } catch {}
};
setInterval(tick, 100);
tick();
`;
	const heartbeat = spawn(process.execPath, ["-e", heartbeatScript], {
		stdio: "ignore",
		detached: true,
	});
	heartbeat.unref();
	return anvilProcess;
}

export async function startNitroFromSnapshot(
	options: RuntimeOptions,
	rpcs: RuntimeRpcs,
): Promise<void> {
	const l2Result = composeUp(
		["sequencer", "validator"],
		{ composeFile: options.composeFile, projectName: options.projectName },
	);
	if (l2Result.exitCode !== 0) {
		throw new Error(l2Result.stderr.trim() || "failed to start L2 services");
	}
	await waitForRpc(rpcs.l2);

	const l3Result = composeUp(
		["l3node"],
		{ composeFile: options.composeFile, projectName: options.projectName },
	);
	if (l3Result.exitCode !== 0) {
		throw new Error(l3Result.stderr.trim() || "failed to start l3node");
	}
	await waitForRpc(rpcs.l3);
}
