import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createRunRecord,
	finishActiveRun,
	loadCurrentRun,
	logRunEvent,
	readEventLogTail,
	readTextLogTail,
	startInlineRunLogging,
	updateRunStep,
} from "../src/run-logger.js";

describe("run logger", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-logger-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("creates and persists a current run record", () => {
		const run = createRunRecord(tmpDir, "testnode", ["init"]);
		const currentRun = loadCurrentRun(tmpDir);

		expect(currentRun?.runId).toBe(run.runId);
		expect(fs.existsSync(run.paths.metaFile)).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, "current-run.json"))).toBe(true);
	});

	it("tracks structured events and run completion for inline runs", () => {
		const run = startInlineRunLogging(tmpDir, ["init"]);

		updateRunStep("deploy-l2-rollup");
		logRunEvent("info", "step.started", "Running step deploy-l2-rollup", {
			step: "deploy-l2-rollup",
		});
		finishActiveRun("completed", { exitCode: 0 });

		const currentRun = loadCurrentRun(tmpDir);
		if (!currentRun) {
			throw new Error("current run should exist");
		}

		expect(currentRun.status).toBe("completed");
		expect(currentRun.currentStep).toBeUndefined();

		const events = readEventLogTail(run.paths.eventsFile, 10);
		expect(events.some((event) => event.event === "step.started")).toBe(true);
		expect(events.at(-1)?.event).toBe("run.completed");

		const textLines = readTextLogTail(run.paths.logFile, 10);
		expect(textLines.some((line) => line.includes("step.started"))).toBe(true);
	});
});
