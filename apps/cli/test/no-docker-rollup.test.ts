import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("init chain steps deploy rollups through a local RollupCreator", () => {
	const initSource = readFileSync(
		resolve(import.meta.dirname, "../../../packages/core/src/init/chain-steps.ts"),
		"utf-8",
	);
	const sdkSource = readFileSync(
		resolve(import.meta.dirname, "../../../packages/core/src/sdk-chain.ts"),
		"utf-8",
	);

	it("uses Docker only to provision the RollupCreator contracts", () => {
		expect(initSource).toContain("deployRollupCreatorViaDocker");
		expect(initSource).toContain("CONTRACT_DEPLOYER_IMAGE");
		expect(initSource).not.toContain("ROLLUPCREATOR_IMAGE");
	});

	it("deploys rollups with the SDK using the local RollupCreator", () => {
		expect(initSource).toContain("deployRollupViaSdk");
		expect(initSource).toContain("rollupCreatorAddress: rollupCreatorDeployment.rollupCreator");
		expect(initSource).toContain("stakeToken: rollupCreatorDeployment.stakeToken");
	});

	it("records the deployed RollupCreator address in deployment artifacts", () => {
		expect(sdkSource).toContain('"rollup-creator"');
	});
});
