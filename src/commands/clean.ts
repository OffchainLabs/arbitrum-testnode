import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { Cli, z } from "incur";
import { composeDown } from "../docker.js";
import { exec } from "../exec.js";
import { stopCurrentRun } from "../run-logger.js";
import { SNAPSHOTS_DIRNAME } from "../snapshot.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");

function stopAllServices(): void {
	console.log("[clean] Stopping Docker...");
	composeDown({ composeFile: COMPOSE_FILE, projectName: "arbitrum-testnode" });
	exec("docker", ["compose", "-f", COMPOSE_FILE, "-p", "arbitrum-testnode", "down", "-v"]);

	console.log("[clean] Killing Anvil...");
	exec("pkill", ["-f", "anvil.*--port.*8545"]);
	exec("pkill", ["-f", "testnode-l1-heartbeat"]);
}

function removeConfigDirPreservingSnapshots(): void {
	for (const entry of readdirSync(CONFIG_DIR)) {
		if (entry === SNAPSHOTS_DIRNAME) {
			continue;
		}
		rmSync(join(CONFIG_DIR, entry), { recursive: true, force: true });
	}
}

function cleanConfigDir(purgeSnapshots: boolean): void {
	if (!existsSync(CONFIG_DIR)) {
		return;
	}
	if (purgeSnapshots) {
		console.log("[clean] Removing config directory...");
		rmSync(CONFIG_DIR, { recursive: true, force: true });
		return;
	}
	console.log("[clean] Removing runtime data and preserving snapshots...");
	removeConfigDirPreservingSnapshots();
}

export const cleanCli = Cli.create("clean", {
	description: "Stop and remove all testnode data",
	options: z.object({
		purgeSnapshots: z
			.boolean()
			.optional()
			.describe("Also delete snapshot bundles under config/snapshots"),
	}),
	run(c) {
		stopCurrentRun(CONFIG_DIR);
		stopAllServices();
		cleanConfigDir(c.options.purgeSnapshots ?? false);
		console.log("[clean] Done.");
		return { success: true };
	},
});
