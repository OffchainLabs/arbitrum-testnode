import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ANVIL_STATE_DIRNAME,
	DEFAULT_SNAPSHOT_ID,
	buildSnapshotManifest,
	getSnapshotConfigDir,
	getSnapshotManifestPath,
	getSnapshotVolumesDir,
	invalidateSnapshot,
	verifySnapshotManifest,
} from "../src/snapshot.js";

const CRITICAL_CONFIG_FILES = [
	"state.json",
	"l2-nodeConfig.json",
	"l3-nodeConfig.json",
	"l2_chain_info.json",
	"l3_chain_info.json",
	"l2_deployment.json",
	"l3_deployment.json",
	"l1-l2-chain-config.json",
	"l2-l3-chain-config.json",
	"localNetwork.json",
	"l1-l2-admin/bridgeUiConfig.json",
	"l2-l3-admin/bridgeUiConfig.json",
] as const;

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "arbitrum-testnode-snapshot-"));
	tempDirs.push(dir);
	return dir;
}

function writeFixtureTree(configDir: string): void {
	for (const filename of CRITICAL_CONFIG_FILES) {
		const fullPath = join(configDir, filename);
		mkdirSync(join(fullPath, ".."), { recursive: true });
		if (filename === "l2_deployment.json" || filename === "l3_deployment.json") {
			writeFileSync(fullPath, JSON.stringify({ rollup: `0x${filename}` }, null, 2));
			continue;
		}
		writeFileSync(fullPath, filename);
	}
	mkdirSync(join(configDir, ANVIL_STATE_DIRNAME), { recursive: true });
	writeFileSync(join(configDir, ANVIL_STATE_DIRNAME, "state.json"), "{}");
}

function copyConfigFixtureToSnapshot(configDir: string): void {
	const snapshotConfigDir = getSnapshotConfigDir(configDir, DEFAULT_SNAPSHOT_ID);
	for (const filename of CRITICAL_CONFIG_FILES) {
		const fullPath = join(snapshotConfigDir, filename);
		mkdirSync(join(fullPath, ".."), { recursive: true });
		writeFileSync(fullPath, readFileSync(join(configDir, filename), "utf-8"));
	}
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

describe("snapshot manifest", () => {
	it("builds and verifies a manifest for a complete snapshot tree", () => {
		const configDir = createTempDir();
		writeFixtureTree(configDir);

		const composeFile = join(configDir, "docker-compose.yaml");
		writeFileSync(composeFile, "services:\n  sequencer:\n    image: offchainlabs/nitro-node:v3.9.5-test\n");

		const manifest = buildSnapshotManifest(configDir, composeFile);
		const snapshotVolumesDir = getSnapshotVolumesDir(configDir, DEFAULT_SNAPSHOT_ID);

		copyConfigFixtureToSnapshot(configDir);
		mkdirSync(join(configDir, "snapshots", DEFAULT_SNAPSHOT_ID, ANVIL_STATE_DIRNAME), {
			recursive: true,
		});
		for (const archiveName of ["sequencer-data.tar", "validator-data.tar", "l3node-data.tar"]) {
			mkdirSync(snapshotVolumesDir, { recursive: true });
			writeFileSync(join(snapshotVolumesDir, archiveName), archiveName);
		}
		writeFileSync(getSnapshotManifestPath(configDir), JSON.stringify(manifest, null, 2));

		const verified = verifySnapshotManifest(configDir);
		expect(verified.nitroNodeImage).toBe("offchainlabs/nitro-node:v3.9.5-test");
		expect(verified.rollups.l2).toBe("0xl2_deployment.json");
		expect(verified.rollups.l3).toBe("0xl3_deployment.json");
	});

	it("fails verification if a config checksum does not match", () => {
		const configDir = createTempDir();
		writeFixtureTree(configDir);

		const composeFile = join(configDir, "docker-compose.yaml");
		writeFileSync(composeFile, "services:\n  sequencer:\n    image: offchainlabs/nitro-node:v3.9.5-test\n");

		const manifest = buildSnapshotManifest(configDir, composeFile);
		const snapshotConfigDir = getSnapshotConfigDir(configDir, DEFAULT_SNAPSHOT_ID);
		const snapshotVolumesDir = getSnapshotVolumesDir(configDir, DEFAULT_SNAPSHOT_ID);

		copyConfigFixtureToSnapshot(configDir);
		writeFileSync(join(snapshotConfigDir, "localNetwork.json"), "tampered");
		mkdirSync(join(configDir, "snapshots", DEFAULT_SNAPSHOT_ID, ANVIL_STATE_DIRNAME), {
			recursive: true,
		});
		for (const archiveName of ["sequencer-data.tar", "validator-data.tar", "l3node-data.tar"]) {
			mkdirSync(snapshotVolumesDir, { recursive: true });
			writeFileSync(join(snapshotVolumesDir, archiveName), archiveName);
		}
		writeFileSync(getSnapshotManifestPath(configDir), JSON.stringify(manifest, null, 2));

		expect(() => verifySnapshotManifest(configDir)).toThrow(
			"Checksum mismatch for snapshot file localNetwork.json",
		);
	});

	it("invalidates a snapshot directory", () => {
		const configDir = createTempDir();
		const snapshotConfigDir = getSnapshotConfigDir(configDir, DEFAULT_SNAPSHOT_ID);
		mkdirSync(snapshotConfigDir, { recursive: true });
		writeFileSync(join(snapshotConfigDir, "state.json"), "{}");

		expect(invalidateSnapshot(configDir)).toBe(true);
		expect(invalidateSnapshot(configDir)).toBe(false);
	});
});
