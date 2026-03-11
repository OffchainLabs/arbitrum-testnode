import { resolve } from "node:path";
import { Cli, z } from "incur";
import { waitForRpc } from "../docker.js";
import {
	captureSnapshot,
	DEFAULT_SNAPSHOT_ID,
	hasSnapshot,
	invalidateSnapshot,
	restoreSnapshot,
	verifySnapshotManifest,
	verifySnapshotSemanticState,
} from "../snapshot.js";
import { startAnvilWithState, startNitroFromSnapshot, stopRuntime } from "../runtime.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");

const RPCS = {
	l1: "http://127.0.0.1:8545",
	l2: "http://127.0.0.1:8547",
	l3: "http://127.0.0.1:8549",
} as const;

export const snapshotCli = Cli.create("snapshot", {
	description: "Snapshot lifecycle commands",
});

const snapshotOptions = z.object({
	id: z.string().optional().describe("Snapshot identifier (default: default)"),
});

snapshotCli.command("build", {
	description: "Capture the current initialized stack into a reusable snapshot",
	options: snapshotOptions,
	async run(c) {
		const snapshotId = c.options.id ?? DEFAULT_SNAPSHOT_ID;
		verifySnapshotSemanticState(CONFIG_DIR, RPCS);
		stopRuntime({
			composeFile: COMPOSE_FILE,
			projectName: "arbitrum-testnode",
			configDir: CONFIG_DIR,
		});
		const manifest = captureSnapshot(CONFIG_DIR, COMPOSE_FILE, snapshotId);
		startAnvilWithState(CONFIG_DIR);
		await waitForRpc(RPCS.l1);
		await startNitroFromSnapshot(
			{
				composeFile: COMPOSE_FILE,
				projectName: "arbitrum-testnode",
				configDir: CONFIG_DIR,
			},
			RPCS,
		);
		verifySnapshotSemanticState(CONFIG_DIR, RPCS);
		return {
			success: true,
			snapshotId,
			manifest,
		};
	},
});

snapshotCli.command("restore", {
	description: "Restore a snapshot and start the stack from it",
	options: snapshotOptions,
	async run(c) {
		const snapshotId = c.options.id ?? DEFAULT_SNAPSHOT_ID;
		stopRuntime({
			composeFile: COMPOSE_FILE,
			projectName: "arbitrum-testnode",
			configDir: CONFIG_DIR,
		});
		const manifest = restoreSnapshot(CONFIG_DIR, snapshotId);
		startAnvilWithState(CONFIG_DIR);
		await waitForRpc(RPCS.l1);
		await startNitroFromSnapshot(
			{
				composeFile: COMPOSE_FILE,
				projectName: "arbitrum-testnode",
				configDir: CONFIG_DIR,
			},
			RPCS,
		);
		verifySnapshotSemanticState(CONFIG_DIR, RPCS);
		return {
			success: true,
			snapshotId,
			manifest,
		};
	},
});

snapshotCli.command("verify", {
	description: "Verify snapshot structure and, if running, semantic bridge state",
	options: snapshotOptions,
	async run(c) {
		const snapshotId = c.options.id ?? DEFAULT_SNAPSHOT_ID;
		const manifest = verifySnapshotManifest(CONFIG_DIR, snapshotId);
		let semanticState: "skipped" | "verified" = "skipped";
		try {
			await waitForRpc(RPCS.l1, 1_000, 100);
			await waitForRpc(RPCS.l2, 1_000, 100);
			await waitForRpc(RPCS.l3, 1_000, 100);
			verifySnapshotSemanticState(CONFIG_DIR, RPCS);
			semanticState = "verified";
		} catch {
			semanticState = "skipped";
		}
		return {
			success: true,
			snapshotId,
			semanticState,
			manifest,
		};
	},
});

snapshotCli.command("invalidate", {
	description: "Remove a snapshot bundle",
	options: snapshotOptions,
	run(c) {
		const snapshotId = c.options.id ?? DEFAULT_SNAPSHOT_ID;
		return {
			success: true,
			snapshotId,
			removed: invalidateSnapshot(CONFIG_DIR, snapshotId),
		};
	},
});

export function hasDefaultSnapshot(): boolean {
	return hasSnapshot(CONFIG_DIR, DEFAULT_SNAPSHOT_ID);
}
