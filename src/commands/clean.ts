import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { Cli } from "incur";
import { composeDown } from "../docker.js";
import { exec } from "../exec.js";
import { stopCurrentRun } from "../run-logger.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");

export const cleanCli = Cli.create("clean", {
	description: "Stop and remove all testnode data",
	run() {
		stopCurrentRun(CONFIG_DIR);

		console.log("[clean] Stopping Docker...");
		composeDown({ composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" });
		exec("docker", ["compose", "-f", COMPOSE_FILE, "-p", "arbitrum-testnode", "down", "-v"]);

		console.log("[clean] Killing Anvil...");
		exec("pkill", ["-f", "anvil.*--port.*8545"]);

		if (existsSync(CONFIG_DIR)) {
			console.log("[clean] Removing config directory...");
			rmSync(CONFIG_DIR, { recursive: true, force: true });
		}

		console.log("[clean] Done.");
		return { success: true };
	},
});
