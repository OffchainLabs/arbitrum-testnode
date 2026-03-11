import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createState,
	getNextPendingStep,
	isStepDone,
	loadState,
	markStepDone,
	markStepFailed,
	saveState,
} from "../src/state.js";

/**
 * The 14-step init sequence for booting L1 + L2 + L3 with bridges.
 * Defined here (not imported from commands/init.ts) to avoid side effects.
 */
const INIT_STEPS = [
	"start-l1",
	"wait-l1",
	"deploy-l2-rollup",
	"generate-l2-config",
	"start-l2",
	"wait-l2",
	"deposit-eth-to-l2",
	"deploy-l2-token-bridge",
	"deploy-l3-rollup",
	"generate-l3-config",
	"start-l3",
	"wait-l3",
	"deposit-eth-to-l3",
	"deploy-l3-token-bridge",
] as const;

describe("init step orchestration", () => {
	describe("step order", () => {
		it("has exactly 14 entries", () => {
			expect(INIT_STEPS).toHaveLength(14);
		});

		it("starts with L1 boot and ends with L3 token bridge", () => {
			expect(INIT_STEPS[0]).toBe("start-l1");
			expect(INIT_STEPS[13]).toBe("deploy-l3-token-bridge");
		});

		it("has L2 steps before L3 steps", () => {
			const deployL2Rollup = INIT_STEPS.indexOf("deploy-l2-rollup");
			const deployL3Rollup = INIT_STEPS.indexOf("deploy-l3-rollup");
			expect(deployL2Rollup).toBeLessThan(deployL3Rollup);
		});

		it("waits for each chain before using it", () => {
			expect(INIT_STEPS.indexOf("start-l1")).toBeLessThan(INIT_STEPS.indexOf("wait-l1"));
			expect(INIT_STEPS.indexOf("start-l2")).toBeLessThan(INIT_STEPS.indexOf("wait-l2"));
			expect(INIT_STEPS.indexOf("start-l3")).toBeLessThan(INIT_STEPS.indexOf("wait-l3"));
		});
	});

	describe("fresh init", () => {
		it("starts from first step when no steps are done", () => {
			const state = createState();
			const next = getNextPendingStep(state, [...INIT_STEPS]);
			expect(next).toBe("start-l1");
		});

		it("marks no steps as done in a fresh state", () => {
			const state = createState();
			for (const step of INIT_STEPS) {
				expect(isStepDone(state, step)).toBe(false);
			}
		});
	});

	describe("resume skips completed steps", () => {
		it("returns deploy-l2-rollup when first 2 steps are done", () => {
			let state = createState();
			state = markStepDone(state, "start-l1");
			state = markStepDone(state, "wait-l1");

			const next = getNextPendingStep(state, [...INIT_STEPS]);
			expect(next).toBe("deploy-l2-rollup");
		});

		it("returns start-l3 when first 10 steps are done", () => {
			let state = createState();
			for (const step of INIT_STEPS.slice(0, 10)) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, [...INIT_STEPS]);
			expect(next).toBe("start-l3");
		});

		it("returns the last step when all but last are done", () => {
			let state = createState();
			for (const step of INIT_STEPS.slice(0, 13)) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, [...INIT_STEPS]);
			expect(next).toBe("deploy-l3-token-bridge");
		});
	});

	describe("all steps done", () => {
		it("returns null when all 14 steps are done", () => {
			let state = createState();
			for (const step of INIT_STEPS) {
				state = markStepDone(state, step);
			}

			const next = getNextPendingStep(state, [...INIT_STEPS]);
			expect(next).toBeNull();
		});

		it("reports every step as done", () => {
			let state = createState();
			for (const step of INIT_STEPS) {
				state = markStepDone(state, step);
			}

			for (const step of INIT_STEPS) {
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

			const next = getNextPendingStep(state, [...INIT_STEPS]);
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

			const next = getNextPendingStep(state, [...INIT_STEPS]);
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

			const next = getNextPendingStep(loaded, [...INIT_STEPS]);
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

			const next = getNextPendingStep(loaded, [...INIT_STEPS]);
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
