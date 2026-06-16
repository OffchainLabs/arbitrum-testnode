import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function createTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "arbitrum-testnode-resolve-"));
	tempDirs.push(dir);
	return dir;
}

function readOutputs(path: string): Record<string, string> {
	return Object.fromEntries(
		readFileSync(path, "utf-8")
			.trim()
			.split("\n")
			.map((line) => line.split("=") as [string, string]),
	);
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { force: true, recursive: true });
		}
	}
});

describe("resolve-testnode", () => {
	it("uses the default testnode config with a tag-provided version", () => {
		const dir = createTempDir();
		const outputPath = join(dir, "github-output");

		execFileSync(
			"node",
			[resolve("scripts/ci/resolve-testnode.mjs"), "--name", "default", "--version", "v1.2.3"],
			{
				cwd: resolve("."),
				env: { ...process.env, GITHUB_OUTPUT: outputPath },
				stdio: "pipe",
			},
		);

		expect(readOutputs(outputPath)).toEqual({
			"nitro-contracts-version": "v3.2",
			"snapshot-version": "v0.1.6",
			variant: "l3-eth",
			version: "v1.2.3",
		});
	});

	it("lets explicit workflow inputs override config defaults", () => {
		const dir = createTempDir();
		const outputPath = join(dir, "github-output");

		execFileSync(
			"node",
			[
				resolve("scripts/ci/resolve-testnode.mjs"),
				"--name",
				"default",
				"--version",
				"v1.2.3",
				"--snapshot-version",
				"v9.9.9",
				"--variant",
				"l2",
				"--nitro-contracts-version",
				"v2.1",
			],
			{
				cwd: resolve("."),
				env: { ...process.env, GITHUB_OUTPUT: outputPath },
				stdio: "pipe",
			},
		);

		expect(readOutputs(outputPath)).toEqual({
			"nitro-contracts-version": "v2.1",
			"snapshot-version": "v9.9.9",
			variant: "l2",
			version: "v1.2.3",
		});
	});
});
