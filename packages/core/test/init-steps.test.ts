import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInitSteps } from "../src/init/steps.js";
import {
	createState,
	getNextPendingStep,
	isStepDone,
	loadState,
	markStepDone,
	markStepFailed,
	saveState,
} from "../src/state.js";

describe("init step orchestration", () => {
	const defaultSteps = getInitSteps();
	const l2Steps = getInitSteps({ l3Enabled: false });
	const timeboostSteps = getInitSteps({ timeboostEnabled: true });
	const l2TimeboostSteps = getInitSteps({ l3Enabled: false, timeboostEnabled: true });

	describe("step order", () => {
		it("has exactly 15 default entries", () => {
			expect(defaultSteps).toHaveLength(15);
		});

		it("has exactly 18 entries when Timeboost is enabled", () => {
			expect(timeboostSteps).toHaveLength(18);
		});

		it("omits L3 steps when L3 is disabled", () => {
			expect(l2Steps).toEqual([
				"start-l1",
				"wait-l1",
				"deploy-l2-rollup",
				"generate-l2-config",
				"start-l2",
				"wait-l2",
				"deposit-eth-to-l2",
				"fund-l2owner",
				"deploy-l2-token-bridge",
			]);
		});

		it("keeps Timeboost in the L2-only step list", () => {
			expect(l2TimeboostSteps).toEqual([
				"start-l1",
				"wait-l1",
				"deploy-l2-rollup",
				"generate-l2-config",
				"start-l2",
				"wait-l2",
				"deposit-eth-to-l2",
				"fund-l2owner",
				"deploy-timeboost-auction",
				"restart-l2-timeboost",
				"wait-l2-timeboost",
				"deploy-l2-token-bridge",
			]);
		});

		it("starts with L1 boot and ends with L3 token bridge by default", () => {
			expect(defaultSteps[0]).toBe("start-l1");
			expect(defaultSteps[14]).toBe("deploy-l3-token-bridge");
		});

		it("has L2 steps before L3 steps", () => {
			const deployL2Rollup = defaultSteps.indexOf("deploy-l2-rollup");
			const deployL3Rollup = defaultSteps.indexOf("deploy-l3-rollup");
			expect(deployL2Rollup).toBeLessThan(deployL3Rollup);
		});

		it("waits for each chain before using it by default", () => {
			expect(defaultSteps.indexOf("start-l1")).toBeLessThan(defaultSteps.indexOf("wait-l1"));
			expect(defaultSteps.indexOf("start-l2")).toBeLessThan(defaultSteps.indexOf("wait-l2"));
			expect(defaultSteps.indexOf("wait-l2")).toBeLessThan(
				defaultSteps.indexOf("deposit-eth-to-l2"),
			);
			expect(defaultSteps.indexOf("deposit-eth-to-l2")).toBeLessThan(
				defaultSteps.indexOf("fund-l2owner"),
			);
			expect(defaultSteps.indexOf("fund-l2owner")).toBeLessThan(
				defaultSteps.indexOf("deploy-l2-token-bridge"),
			);
			expect(defaultSteps.indexOf("start-l3")).toBeLessThan(defaultSteps.indexOf("wait-l3"));
		});

		it("omits Timeboost steps by default", () => {
			expect(defaultSteps).not.toContain("deploy-timeboost-auction");
			expect(defaultSteps).not.toContain("restart-l2-timeboost");
			expect(defaultSteps).not.toContain("wait-l2-timeboost");
		});

		it("inserts Timeboost steps only when enabled", () => {
			expect(timeboostSteps.indexOf("wait-l2")).toBeLessThan(
				timeboostSteps.indexOf("deposit-eth-to-l2"),
			);
			expect(timeboostSteps.indexOf("deposit-eth-to-l2")).toBeLessThan(
				timeboostSteps.indexOf("fund-l2owner"),
			);
			expect(timeboostSteps.indexOf("fund-l2owner")).toBeLessThan(
				timeboostSteps.indexOf("deploy-timeboost-auction"),
			);
			expect(timeboostSteps.indexOf("deploy-timeboost-auction")).toBeLessThan(
				timeboostSteps.indexOf("restart-l2-timeboost"),
			);
			expect(timeboostSteps.indexOf("restart-l2-timeboost")).toBeLessThan(
				timeboostSteps.indexOf("wait-l2-timeboost"),
			);
			expect(timeboostSteps.indexOf("wait-l2-timeboost")).toBeLessThan(
				timeboostSteps.indexOf("deploy-l2-token-bridge"),
			);
		});
	});

	describe("fresh init", () => {
		it("starts from first step when no steps are done", () => {
			const state = createState();
			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("start-l1");
		});

		it("marks no steps as done in a fresh state", () => {
			const state = createState();
			for (const step of defaultSteps) {
				expect(isStepDone(state, step)).toBe(false);
			}
		});
	});

	describe("resume skips completed steps", () => {
		it("returns deploy-l2-rollup when first 2 steps are done", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepDone(state, "wait-l1");

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("deploy-l2-rollup");
		});

		it("returns start-l3 when all L2 setup steps are done", () => {
			let state = createState();
			for (const step of defaultSteps.slice(0, defaultSteps.indexOf("start-l3"))) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("start-l3");
		});

		it("returns the last step when all but last are done", () => {
			let state = createState();
			for (const step of defaultSteps.slice(0, defaultSteps.indexOf("deploy-l3-token-bridge"))) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("deploy-l3-token-bridge");
		});
	});

	describe("all steps done", () => {
		it("returns null when all default steps are done", () => {
			let state = createState();
			for (const step of defaultSteps) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBeNull();
		});

		it("reports every step as done", () => {
			let state = createState();
			for (const step of defaultSteps) {
				state = markStepDone(state, step);
			}

			for (const step of defaultSteps) {
				expect(isStepDone(state, step)).toBe(true);
			}
		});
	});

	describe("failed step can be retried", () => {
		it("returns the failed step as the next pending step", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepDone(state, "wait-l1");
			state = markStepFailed(state, "deploy-l2-rollup", "deployment failed");

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("deploy-l2-rollup");
		});

		it("does not consider a failed step as done", () => {
			let state = createState();
			state = markStepFailed(state, "start-l1", "docker not running");

			expect(isStepDone(state, "start-l1")).toBe(false);
		});

		it("can be marked done after a retry", () => {
			let state = createState();
			state = markStepFailed(state, "start-l1", "docker not running");
			expect(isStepDone(state, "start-l1")).toBe(false);

			state = markStepDone(state, "start-l1");
			expect(isStepDone(state, "start-l1")).toBe(true);

			const next = getNextPendingStep(state, defaultSteps);
			expect(next).toBe("wait-l1");
		});
	});

	describe("state persistence", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-steps-test-"));
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("round-trips init state with step data across save/load", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepDone(state, "wait-l1");
			state = markStepDone(state, "deploy-l2-rollup", {
				rollupAddress: "0xabc",
				inboxAddress: "0xdef",
			});

			saveState(tmpDir, state);
			const loaded = loadState(tmpDir);

			expect(loaded).not.toBeNull();
			expect(loaded).toEqual(state);
		});

		it("preserves step completion across save/load for resume", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepDone(state, "wait-l1");

			saveState(tmpDir, state);
			const loaded = loadState(tmpDir);
			if (loaded === null) {
				throw new Error("loaded state should not be null");
			}

			const next = getNextPendingStep(loaded, defaultSteps);
			expect(next).toBe("deploy-l2-rollup");
		});

		it("preserves failed steps across save/load", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepFailed(state, "wait-l1", "RPC timeout after 30s");

			saveState(tmpDir, state);
			const loaded = loadState(tmpDir);
			if (loaded === null) {
				throw new Error("loaded state should not be null");
			}

			const next = getNextPendingStep(loaded, defaultSteps);
			expect(next).toBe("wait-l1");

			const step = loaded.steps["wait-l1"];
			if (step === undefined) {
				throw new Error("wait-l1 step should be defined");
			}
			expect(step.status).toBe("failed");
			expect(step.error).toBe("RPC timeout after 30s");
		});

		it("returns null when loading from a directory with no state", () => {
			const emptyDir = path.join(tmpDir, "empty");
			expect(loadState(emptyDir)).toBeNull();
		});
	});
});
