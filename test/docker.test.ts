import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	composeDown,
	composePs,
	composeRestart,
	composeUp,
	isServiceRunning,
	waitForRpc,
} from "../src/docker.js";
import * as execModule from "../src/exec.js";
import type { ExecResult } from "../src/exec.js";

vi.mock("../src/exec.js", () => ({
	exec: vi.fn(),
}));

const mockExec = execModule.exec as unknown as MockInstance<
	(command: string, args: string[], options?: { cwd?: string; timeout?: number }) => ExecResult
>;

const defaultOptions = { composeFile: "/path/to/docker-compose.yaml" };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("composeUp", () => {
	it("calls docker compose up with the correct arguments", () => {
		mockExec.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });
		composeUp(["sequencer", "poster"], defaultOptions);
		expect(mockExec).toHaveBeenCalledWith("docker", [
			"compose",
			"-f",
			"/path/to/docker-compose.yaml",
			"up",
			"-d",
			"sequencer",
			"poster",
		]);
	});

	it("includes project name when provided", () => {
		mockExec.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });
		composeUp(["sequencer"], { ...defaultOptions, projectName: "my-testnode" });
		expect(mockExec).toHaveBeenCalledWith("docker", [
			"compose",
			"-f",
			"/path/to/docker-compose.yaml",
			"-p",
			"my-testnode",
			"up",
			"-d",
			"sequencer",
		]);
	});
});

describe("composeDown", () => {
	it("calls docker compose down", () => {
		mockExec.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });
		composeDown(defaultOptions);
		expect(mockExec).toHaveBeenCalledWith("docker", [
			"compose",
			"-f",
			"/path/to/docker-compose.yaml",
			"down",
		]);
	});
});

describe("composePs", () => {
	it("calls docker compose ps", () => {
		mockExec.mockReturnValue({ stdout: "sequencer running", stderr: "", exitCode: 0 });
		const result = composePs(defaultOptions);
		expect(mockExec).toHaveBeenCalledWith("docker", [
			"compose",
			"-f",
			"/path/to/docker-compose.yaml",
			"ps",
		]);
		expect(result.stdout).toBe("sequencer running");
	});
});

describe("composeRestart", () => {
	it("calls docker compose restart for the given services", () => {
		mockExec.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });
		composeRestart(["l3node"], defaultOptions);
		expect(mockExec).toHaveBeenCalledWith("docker", [
			"compose",
			"-f",
			"/path/to/docker-compose.yaml",
			"restart",
			"l3node",
		]);
	});
});

describe("isServiceRunning", () => {
	it("returns true when compose ps shows the service as running", () => {
		mockExec.mockReturnValue({
			stdout: [
				"NAME                    COMMAND   SERVICE      STATUS",
				"testnode-sequencer-1    ...       sequencer    running",
			].join("\n"),
			stderr: "",
			exitCode: 0,
		});
		expect(isServiceRunning("sequencer", defaultOptions)).toBe(true);
	});

	it("returns false when compose ps does not show the service", () => {
		mockExec.mockReturnValue({
			stdout: [
				"NAME                    COMMAND   SERVICE      STATUS",
				"testnode-poster-1       ...       poster       running",
			].join("\n"),
			stderr: "",
			exitCode: 0,
		});
		expect(isServiceRunning("sequencer", defaultOptions)).toBe(false);
	});

	it("returns false when compose ps exits with non-zero", () => {
		mockExec.mockReturnValue({ stdout: "", stderr: "error", exitCode: 1 });
		expect(isServiceRunning("sequencer", defaultOptions)).toBe(false);
	});
});

describe("waitForRpc", () => {
	let fetchSpy: MockInstance;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves when RPC responds with a valid result", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 }),
		);

		await expect(waitForRpc("http://localhost:8545", 5000, 10)).resolves.toBeUndefined();
	});

	it("rejects on timeout when RPC never responds", async () => {
		fetchSpy.mockRejectedValue(new Error("Connection refused"));

		// Use a very short timeout so the test completes quickly
		await expect(waitForRpc("http://localhost:8545", 100, 10)).rejects.toThrow(
			"RPC at http://localhost:8545 not ready",
		);
	});

	it("retries and resolves when RPC responds after initial failures", async () => {
		fetchSpy
			.mockRejectedValueOnce(new Error("Connection refused"))
			.mockRejectedValueOnce(new Error("Connection refused"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), {
					status: 200,
				}),
			);

		// Use short poll interval so retries happen quickly
		await expect(waitForRpc("http://localhost:8545", 5000, 10)).resolves.toBeUndefined();
		expect(fetchSpy).toHaveBeenCalledTimes(3);
	});
});
