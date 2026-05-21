import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: the rollup deployment steps must use the viem-based
 * `deployRollupViaSdk` helper, not a Docker-spawned rollup creator.
 *
 * Commit 30094b4 migrated L3 off Docker; the follow-up migrates L2.
 * If someone re-introduces `deployRollupViaDocker` or the
 * `ROLLUPCREATOR_IMAGE` constant, this test will fail.
 */
describe("init.ts does not deploy rollups via Docker", () => {
	const initSource = readFileSync(resolve(import.meta.dirname, "../src/commands/init.ts"), "utf-8");

	it("does not reference the deployRollupViaDocker helper", () => {
		expect(initSource).not.toContain("deployRollupViaDocker");
	});

	it("does not reference the ROLLUPCREATOR_IMAGE constant", () => {
		expect(initSource).not.toContain("ROLLUPCREATOR_IMAGE");
	});

	it("calls deployRollupViaSdk for the L2 chain (arb-dev-test)", () => {
		// Find each deployRollupViaSdk(...) call and confirm at least one of
		// them contains the L2 chain name "arb-dev-test". This proves L2 is
		// going through the SDK path rather than a re-introduced Docker path.
		const callRegex = /deployRollupViaSdk\s*\(([\s\S]*?)\n\s*\}\)/g;
		const matches = [...initSource.matchAll(callRegex)];
		expect(matches.length).toBeGreaterThan(0);
		const l2SdkCall = matches.find((m) => m[1]?.includes('"arb-dev-test"'));
		expect(l2SdkCall, "deployRollupViaSdk call for arb-dev-test not found").toBeDefined();
	});
});
