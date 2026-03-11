import { resolve } from "node:path";
import { Cli } from "incur";
import { isServiceRunning } from "../docker.js";
import { exec } from "../exec.js";
import { isPidRunning, loadCurrentRun, readEventLogTail } from "../run-logger.js";
import { loadState } from "../state.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");
const DOCKER_OPTS = { composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" };

const RPCS = {
	l1: "http://127.0.0.1:8545",
	l2: "http://127.0.0.1:8547",
	l3: "http://127.0.0.1:8549",
};

export const statusCli = Cli.create("status", {
	description: "Show testnode status",
	run() {
		const state = loadState(CONFIG_DIR);
		const run = loadCurrentRun(CONFIG_DIR);

		// Check Anvil (L1) — it runs on host, not in Docker
		const anvilCheck = exec("pgrep", ["-f", "anvil.*--port.*8545"]);
		const anvilRunning = anvilCheck.exitCode === 0;

		const services: Record<string, boolean> = {
			anvil: anvilRunning,
			sequencer: isServiceRunning("sequencer", DOCKER_OPTS),
			validator: isServiceRunning("validator", DOCKER_OPTS),
			l3node: isServiceRunning("l3node", DOCKER_OPTS),
		};

		return {
			initialized: state !== null,
			services,
			rpcs: RPCS,
			run: run
				? {
						...run,
						alive: isPidRunning(run.pid),
						recentEvents: readEventLogTail(run.paths.eventsFile, 10),
					}
				: null,
			initSteps: state?.steps ?? {},
		};
	},
});
