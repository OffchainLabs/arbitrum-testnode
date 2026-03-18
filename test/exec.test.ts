import { describe, expect, it } from "vitest";
import { arbitrum, exec, execOrThrow } from "../src/exec.js";

describe("exec", () => {
	it("runs a command and captures stdout", () => {
		const result = exec("echo", ["hello"]);
		expect(result.stdout.trim()).toBe("hello");
		expect(result.exitCode).toBe(0);
	});

	it("captures stderr", () => {
		const result = exec("sh", ["-c", "echo error >&2"]);
		expect(result.stderr.trim()).toBe("error");
		expect(result.exitCode).toBe(0);
	});

	it("returns non-zero exit code without throwing", () => {
		const result = exec("sh", ["-c", "exit 42"]);
		expect(result.exitCode).toBe(42);
	});
});

describe("execOrThrow", () => {
	it("returns stdout on success", () => {
		const stdout = execOrThrow("echo", ["hello"]);
		expect(stdout.trim()).toBe("hello");
	});

	it("throws on non-zero exit", () => {
		expect(() => execOrThrow("sh", ["-c", "echo fail >&2; exit 1"])).toThrow("sh failed");
	});
});

describe("arbitrum", () => {
	it("calls exec with 'arbitrum' as the command", () => {
		// arbitrum --version returns version string
		const stdout = arbitrum(["--version"]);
		expect(stdout).toContain("0.1.0");
	});
});

