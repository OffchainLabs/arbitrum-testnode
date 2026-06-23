import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { composeDown } from "@arbitrum/testnode-core/docker.js";
import { exec } from "@arbitrum/testnode-core/exec.js";
import { stopCurrentRun } from "@arbitrum/testnode-core/run-logger.js";
import { SNAPSHOTS_DIRNAME } from "@arbitrum/testnode-core/snapshot.js";
import { Cli, z } from "incur";
import { projectRoot } from "../project-root.js";

function stopAllServices(composeFile: string): void {
	console.log("[clean] Stopping Docker...");
	composeDown({ composeFile, projectName: "arbitrum-testnode" });
	exec("docker", ["compose", "-f", composeFile, "-p", "arbitrum-testnode", "down", "-v"]);
}

function removeConfigDirPreservingSnapshots(configDir: string): void {
	for (const entry of readdirSync(configDir)) {
		if (entry === SNAPSHOTS_DIRNAME) {
			continue;
		}
		rmSync(join(configDir, entry), { recursive: true, force: true });
	}
}

function cleanConfigDir(configDir: string, purgeSnapshots: boolean): void {
	if (!existsSync(configDir)) {
		return;
	}
	if (purgeSnapshots) {
		console.log("[clean] Removing config directory...");
		rmSync(configDir, { recursive: true, force: true });
		return;
	}
	console.log("[clean] Removing runtime data and preserving snapshots...");
	removeConfigDirPreservingSnapshots(configDir);
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
		const CONFIG_DIR = resolve(projectRoot(), "config");
		const COMPOSE_FILE = resolve(projectRoot(), "docker/docker-compose.yaml");
		stopCurrentRun(CONFIG_DIR);
		stopAllServices(COMPOSE_FILE);
		cleanConfigDir(CONFIG_DIR, c.options.purgeSnapshots ?? false);
		console.log("[clean] Done.");
		return { success: true };
	},
});
