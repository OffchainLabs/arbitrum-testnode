import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "arbitrum-testnode-context-"));
	tempDirs.push(dir);
	return dir;
}

function writeTarFixture(sourceDir: string, archivePath: string, marker: string): void {
	mkdirSync(sourceDir, { recursive: true });
	writeFileSync(join(sourceDir, marker), marker);
	execFileSync("tar", ["-cf", archivePath, "-C", sourceDir, "."]);
}

function createSnapshotFixture(rootDir: string, snapshotId = "default"): string {
	const snapshotDir = join(rootDir, "config", "snapshots", snapshotId);
	const configDir = join(snapshotDir, "config");
	const volumeDir = join(snapshotDir, "volumes");

	mkdirSync(join(configDir, "l1-l2-admin"), { recursive: true });
	mkdirSync(join(configDir, "l2-l3-admin"), { recursive: true });
	writeFileSync(
		join(configDir, "l2-nodeConfig.json"),
		'{"parent-chain":{"connection":{"url":"http://host.docker.internal:8545"}}}\n',
	);
	writeFileSync(
		join(configDir, "l3-nodeConfig.json"),
		'{"parent-chain":{"connection":{"url":"http://sequencer:8547"}}}\n',
	);
	writeFileSync(
		join(configDir, "l1-l2-admin", "bridgeUiConfig.json"),
		'{"parentChainRpc":"http://127.0.0.1:8545","chainRpc":"http://127.0.0.1:8547"}\n',
	);
	writeFileSync(
		join(configDir, "l2-l3-admin", "bridgeUiConfig.json"),
		'{"parentChainRpc":"http://127.0.0.1:8547","chainRpc":"http://127.0.0.1:8549"}\n',
	);
	writeFileSync(join(configDir, "localNetwork.json"), "{}\n");
	writeFileSync(join(configDir, "l1l2_network.json"), "{}\n");
	writeFileSync(join(configDir, "l2l3_network.json"), "{}\n");
	mkdirSync(join(snapshotDir, "anvil-state"), { recursive: true });
	writeFileSync(join(snapshotDir, "anvil-state", "state.json"), "{}");
	mkdirSync(volumeDir, { recursive: true });
	writeTarFixture(
		join(rootDir, "sequencer-data"),
		join(volumeDir, "sequencer-data.tar"),
		"seq.txt",
	);
	writeTarFixture(
		join(rootDir, "validator-data"),
		join(volumeDir, "validator-data.tar"),
		"val.txt",
	);
	writeTarFixture(join(rootDir, "l3node-data"), join(volumeDir, "l3node-data.tar"), "l3.txt");

	return snapshotDir;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { force: true, recursive: true });
		}
	}
});

describe("prepare-testnode-context", () => {
	it("rewrites runtime and export config URLs and extracts volume archives", () => {
		const rootDir = createTempDir();
		const snapshotDir = createSnapshotFixture(rootDir);
		const outputDir = join(rootDir, "context");

		execFileSync(
			"node",
			[
				resolve("scripts/ci/prepare-testnode-context.mjs"),
				"--variant",
				"l3-eth",
				"--snapshot-id",
				"default",
				"--snapshot-dir",
				snapshotDir,
				"--output-dir",
				outputDir,
				"--nitro-contracts-version",
				"v3.2",
				"--testnode-name",
				"fast",
			],
			{ cwd: resolve("."), stdio: "pipe" },
		);

		expect(
			readFileSync(join(outputDir, "runtime-config", "l2-nodeConfig.json"), "utf-8"),
		).toContain("http://127.0.0.1:8545");
		expect(
			readFileSync(join(outputDir, "export-config", "l2-l3-admin", "bridgeUiConfig.json"), "utf-8"),
		).toContain("http://127.0.0.1:3347");
		expect(existsSync(join(outputDir, "runtime", "sequencer", ".arbitrum", "seq.txt"))).toBe(true);
		expect(existsSync(join(outputDir, "runtime", "validator", ".arbitrum", "val.txt"))).toBe(true);
		expect(existsSync(join(outputDir, "runtime", "l3node", ".arbitrum", "l3.txt"))).toBe(true);

		const metadata = JSON.parse(readFileSync(join(outputDir, "metadata.json"), "utf-8"));
		expect(metadata).toEqual({
			l3Enabled: true,
			nitroContractsVersion: "v3.2",
			snapshotId: "default",
			testnodeName: "fast",
			variant: "l3-eth",
		});
	});

	it("prepares named bundle contexts from configured snapshots", () => {
		const rootDir = createTempDir();
		createSnapshotFixture(rootDir, "default");
		createSnapshotFixture(rootDir, "l2");
		writeFileSync(
			join(rootDir, "config", "testnodes.json"),
			JSON.stringify(
				{
					testnodes: {
						default: {
							variant: "l3-eth",
							snapshotId: "default",
							nitroContractsVersion: "v3.2",
						},
						l2: {
							variant: "l2",
							snapshotId: "l2",
							nitroContractsVersion: "v3.2",
						},
					},
				},
				null,
				2,
			),
		);

		execFileSync("node", [resolve("scripts/ci/prepare-testnode-bundle-context.mjs")], {
			cwd: rootDir,
			stdio: "pipe",
		});

		const rootMetadata = JSON.parse(
			readFileSync(join(rootDir, ".testnode-context", "metadata.json"), "utf-8"),
		);
		expect(rootMetadata).toEqual({
			bundled: true,
			defaultTestnodeName: "default",
		});
		const defaultMetadata = JSON.parse(
			readFileSync(
				join(rootDir, ".testnode-context", "testnodes", "default", "metadata.json"),
				"utf-8",
			),
		);
		expect(defaultMetadata).toMatchObject({
			l3Enabled: true,
			snapshotId: "default",
			testnodeName: "default",
			variant: "l3-eth",
		});
		const l2Metadata = JSON.parse(
			readFileSync(join(rootDir, ".testnode-context", "testnodes", "l2", "metadata.json"), "utf-8"),
		);
		expect(l2Metadata).toMatchObject({
			l3Enabled: false,
			snapshotId: "l2",
			testnodeName: "l2",
			variant: "l2",
		});
		expect(
			existsSync(join(rootDir, ".testnode-context", "testnodes", "l2", "runtime", "l3node")),
		).toBe(false);
	});
});
