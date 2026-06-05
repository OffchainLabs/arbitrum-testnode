import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: init rollup deployment currently relies on the Nitro
 * RollupCreator container because the published Chain SDK creates rollups
 * through an existing RollupCreator but does not provision one on rebuilt
 * local chains.
 */
describe("init chain steps deploy rollups through the local RollupCreator", () => {
	const initSource = readFileSync(
		resolve(import.meta.dirname, "../../../packages/core/src/init/chain-steps.ts"),
		"utf-8",
	);

	it("uses the RollupCreator container for rollup deployment", () => {
		expect(initSource).toContain("deployRollupViaDocker");
		expect(initSource).toContain("ROLLUPCREATOR_IMAGE");
	});

	it("gets the wasm module root from Chain SDK defaults", () => {
		expect(initSource).toContain("createRollupPrepareDeploymentParamsConfigDefaults");
		expect(initSource).not.toContain(
			"0x8a7513bf7bb3e3db04b0d982d0e973bcf57bf8b88aef7c6d03dba3a81a56a499",
		);
	});

	it("records the deployed RollupCreator address in deployment artifacts", () => {
		expect(initSource).toContain("addRollupCreatorToDeployment");
		expect(initSource).toContain('"rollup-creator"');
	});
});
