import { resolve } from "node:path";
import { composeDown } from "@arbitrum/testnode-core/docker.js";
import { stopCurrentRun } from "@arbitrum/testnode-core/run-logger.js";
import { Cli } from "incur";
import { projectRoot } from "../project-root.js";

export const stopCli = Cli.create("stop", {
	description: "Stop the testnode (kills Anvil + Docker)",
	run() {
		const CONFIG_DIR = resolve(projectRoot(), "config");
		const COMPOSE_FILE = resolve(projectRoot(), "docker/docker-compose.yaml");
		const DOCKER_OPTS = { composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" };
		if (stopCurrentRun(CONFIG_DIR)) {
			console.log("[stop] Stopped detached init run...");
		}

		console.log("[stop] Stopping Docker services...");
		composeDown(DOCKER_OPTS);

		console.log("[stop] Done.");
		return { success: true };
	},
});
