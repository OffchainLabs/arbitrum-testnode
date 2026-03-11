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

describe("createState", () => {
	it("returns a fresh state with startedAt timestamp", () => {
		const before = new Date().toISOString();
		const state = createState();
		const after = new Date().toISOString();

		expect(state.startedAt).toBeDefined();
		expect(state.startedAt >= before).toBe(true);
		expect(state.startedAt <= after).toBe(true);
		expect(state.steps).toEqual({});
	});
});

describe("markStepDone", () => {
	it("marks a step as done with data and timestamp", () => {
		const state = createState();
		const before = new Date().toISOString();
		const result = markStepDone(state, "deploy-rollup", { address: "0x123" });
		const after = new Date().toISOString();

		const step = result.steps["deploy-rollup"];
		if (step === undefined) {
			throw new Error("step should be defined");
		}
		expect(step.status).toBe("done");
		expect(step.data).toEqual({ address: "0x123" });
		expect(step.completedAt).toBeDefined();
		if (step.completedAt === undefined) {
			throw new Error("completedAt should be defined");
		}
		expect(step.completedAt >= before).toBe(true);
		expect(step.completedAt <= after).toBe(true);
	});
});

describe("markStepFailed", () => {
	it("marks a step as failed with error message and timestamp", () => {
		const state = createState();
		const before = new Date().toISOString();
		const result = markStepFailed(state, "deploy-rollup", "tx reverted");
		const after = new Date().toISOString();

		const step = result.steps["deploy-rollup"];
		if (step === undefined) {
			throw new Error("step should be defined");
		}
		expect(step.status).toBe("failed");
		expect(step.error).toBe("tx reverted");
		expect(step.data).toBeUndefined();
		expect(step.completedAt).toBeDefined();
		if (step.completedAt === undefined) {
			throw new Error("completedAt should be defined");
		}
		expect(step.completedAt >= before).toBe(true);
		expect(step.completedAt <= after).toBe(true);
	});
});

describe("isStepDone", () => {
	it("returns true for done steps", () => {
		const state = markStepDone(createState(), "deploy-rollup");
		expect(isStepDone(state, "deploy-rollup")).toBe(true);
	});

	it("returns false for failed steps", () => {
		const state = markStepFailed(createState(), "deploy-rollup", "boom");
		expect(isStepDone(state, "deploy-rollup")).toBe(false);
	});

	it("returns false for missing steps", () => {
		const state = createState();
		expect(isStepDone(state, "deploy-rollup")).toBe(false);
	});
});

describe("saveState / loadState", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("round-trips state correctly to/from JSON file", () => {
		let state = createState();
		state = markStepDone(state, "deploy-rollup", { address: "0xabc" });
		state = markStepFailed(state, "deploy-bridge", "timeout");

		saveState(tmpDir, state);
		const loaded = loadState(tmpDir);

		expect(loaded).toEqual(state);
	});

	it("returns null if state file does not exist", () => {
		const nonExistentDir = path.join(tmpDir, "does-not-exist");
		expect(loadState(nonExistentDir)).toBeNull();
	});
});

describe("getNextPendingStep", () => {
	const orderedSteps = ["deploy-rollup", "deploy-bridge", "deploy-token-bridge"];

	it("returns first step when none are done", () => {
		const state = createState();
		expect(getNextPendingStep(state, orderedSteps)).toBe("deploy-rollup");
	});

	it("skips done steps and returns the next one", () => {
		let state = createState();
		state = markStepDone(state, "deploy-rollup");
		expect(getNextPendingStep(state, orderedSteps)).toBe("deploy-bridge");
	});

	it("returns failed steps (they are not done)", () => {
		let state = createState();
		state = markStepDone(state, "deploy-rollup");
		state = markStepFailed(state, "deploy-bridge", "timeout");
		expect(getNextPendingStep(state, orderedSteps)).toBe("deploy-bridge");
	});

	it("returns null when all steps are done", () => {
		let state = createState();
		state = markStepDone(state, "deploy-rollup");
		state = markStepDone(state, "deploy-bridge");
		state = markStepDone(state, "deploy-token-bridge");
		expect(getNextPendingStep(state, orderedSteps)).toBeNull();
	});
});
