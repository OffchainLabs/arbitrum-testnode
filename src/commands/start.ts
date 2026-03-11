import { resolve } from "node:path";
import { Cli } from "incur";
import { composeUp, waitForRpc } from "../docker.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");
const DOCKER_OPTS = { composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" };

export const startCli = Cli.create("start", {
	description: "Start the testnode (Nitro nodes; Anvil must be running on host)",
	async run() {
		console.log("[start] Starting Nitro nodes...");
		const result = composeUp(["sequencer", "validator", "l3node"], DOCKER_OPTS);
		if (result.exitCode !== 0) {
			return { success: false, error: result.stderr };
		}
		await waitForRpc("http://127.0.0.1:8547");
		await waitForRpc("http://127.0.0.1:8549");
		console.log("[start] All services running.");
		return { success: true };
	},
});
