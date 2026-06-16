import { describe, expect, it, vi } from "vitest";

vi.mock("../src/run-logger.js", () => ({
	finishActiveRun: vi.fn(),
	logRunEvent: vi.fn(),
	startDetachedInitRun: vi.fn(),
	startInlineRunLogging: vi.fn(),
	startRunLoggingFromEnv: vi.fn(),
	updateRunStep: vi.fn(),
}));

import { InitFailedError, finishFailedInit } from "../src/init/runner.js";

describe("finishFailedInit", () => {
	it("throws an InitFailedError carrying the failed step and cause", () => {
		expect(() =>
			finishFailedInit({ failedStep: "deploy-l2-token-bridge", error: "env failed (exit 1):" }),
		).toThrow(InitFailedError);
	});

	it("surfaces the failed step name in the error message", () => {
		try {
			finishFailedInit({ failedStep: "deploy-l2-token-bridge", error: "boom" });
			expect.unreachable("expected finishFailedInit to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(InitFailedError);
			expect((error as InitFailedError).failedStep).toBe("deploy-l2-token-bridge");
			expect((error as Error).message).toContain("deploy-l2-token-bridge");
		}
	});
});
