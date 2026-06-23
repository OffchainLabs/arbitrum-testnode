import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readPackageVersion(path: string): string {
	const pkg = JSON.parse(readFileSync(path, "utf-8")) as { version?: string };
	if (!pkg.version) {
		throw new Error(`${path} is missing version`);
	}
	return pkg.version;
}

describe("release version source", () => {
	it("keeps workspace package versions aligned with the CLI package version", () => {
		const version = readPackageVersion("apps/cli/package.json");

		expect(readPackageVersion("package.json")).toBe(version);
		expect(readPackageVersion("packages/action/package.json")).toBe(version);
		expect(readPackageVersion("packages/core/package.json")).toBe(version);
		expect(readPackageVersion("packages/testnode/package.json")).toBe(version);
	});
});
