import { resolve } from "node:path";
import { composeDown } from "@arbitrum/testnode-core/docker.js";
import { exec } from "@arbitrum/testnode-core/exec.js";
import { stopCurrentRun } from "@arbitrum/testnode-core/run-logger.js";
import { Cli } from "incur";
import { findProjectRoot } from "../project-root.js";

const PROJECT_ROOT = findProjectRoot();
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");
const DOCKER_OPTS = { composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" };

export const stopCli = Cli.create("stop", {
	description: "Stop the testnode (kills Anvil + Docker)",
	run() {
		if (stopCurrentRun(CONFIG_DIR)) {
			console.log("[stop] Stopped detached init run...");
		}

		console.log("[stop] Stopping Docker services...");
		composeDown(DOCKER_OPTS);

		console.log("[stop] Killing Anvil...");
		exec("pkill", ["-f", "anvil.*--port.*8545"]);
		exec("pkill", ["-f", "testnode-l1-heartbeat"]);

		console.log("[stop] Done.");
		return { success: true };
	},
});
