import { resolve } from "node:path";
import { Cli, z } from "incur";
import { waitForRpc } from "../docker.js";
import { startAnvilWithState, startNitroFromSnapshot, stopRuntime } from "../runtime.js";
import { installSnapshotRelease, packageSnapshotRelease } from "../snapshot-release.js";
import {
	DEFAULT_SNAPSHOT_ID,
	captureSnapshot,
	hasSnapshot,
	invalidateSnapshot,
	restoreSnapshot,
	verifySnapshotManifest,
	verifySnapshotSemanticState,
} from "../snapshot.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");
const COMPOSE_FILE = resolve(PROJECT_ROOT, "docker/docker-compose.yaml");
const SNAPSHOT_PACK_DIR = resolve(PROJECT_ROOT, "dist/snapshots");

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

const snapshotInstallOptions = z.object({
	force: z.boolean().optional().describe("Replace an existing local snapshot"),
	id: z.string().optional().describe("Install the archive into this local snapshot id"),
	repo: z
		.string()
		.optional()
		.describe("GitHub repo in owner/repo form (defaults to TESTNODE_SNAPSHOT_GH_REPO)"),
	releaseTag: z.string().optional().describe("GitHub release tag to install (defaults to latest)"),
	url: z.string().optional().describe("Direct snapshot archive URL override"),
});

const snapshotPackOptions = z.object({
	id: z.string().optional().describe("Snapshot identifier to package (default: default)"),
	outDir: z
		.string()
		.optional()
		.describe(`Output directory for packaged assets (default: ${SNAPSHOT_PACK_DIR})`),
	tag: z.string().describe("Release tag used in the packaged asset names"),
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

snapshotCli.command("install", {
	description: "Download and install a snapshot release",
	options: snapshotInstallOptions,
	async run(c) {
		const result = await installSnapshotRelease({
			composeFile: COMPOSE_FILE,
			configDir: CONFIG_DIR,
			...(c.options.force !== undefined ? { force: c.options.force } : {}),
			...(c.options.id ? { snapshotId: c.options.id } : {}),
			...(c.options.releaseTag ? { version: c.options.releaseTag } : {}),
			...(c.options.repo ? { repo: c.options.repo } : {}),
			...(c.options.url ? { url: c.options.url } : {}),
		});
		return {
			success: true,
			snapshotId: result.snapshotId,
			archiveName: result.archiveName,
			sourceUrl: result.sourceUrl,
			sourceRepo: result.sourceRepo,
			releaseTag: result.releaseTag,
			manifest: result.manifest,
		};
	},
});

snapshotCli.command("pack", {
	description: "Package a local snapshot into GitHub release assets",
	options: snapshotPackOptions,
	run(c) {
		const result = packageSnapshotRelease(CONFIG_DIR, {
			outDir: c.options.outDir ?? SNAPSHOT_PACK_DIR,
			tag: c.options.tag,
			...(c.options.id ? { snapshotId: c.options.id } : {}),
		});
		return {
			success: true,
			snapshotId: result.snapshotId,
			tag: result.tag,
			archiveName: result.archiveName,
			archivePath: result.archivePath,
			checksum: result.checksum,
			checksumName: result.checksumName,
			checksumPath: result.checksumPath,
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
