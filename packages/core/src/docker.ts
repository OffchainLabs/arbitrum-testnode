import { exec } from "./exec.js";
import type { ExecResult } from "./exec.js";

export interface DockerOptions {
	composeFile: string;
	projectName?: string;
}

function baseArgs(options: DockerOptions): string[] {
	const args = ["compose", "-f", options.composeFile];
	if (options.projectName) {
		args.push("-p", options.projectName);
	}
	return args;
}

/**
 * Run `docker compose up -d` for the given services.
 */
export function composeUp(services: string[], options: DockerOptions): ExecResult {
	return exec("docker", [...baseArgs(options), "up", "-d", ...services]);
}

/**
 * Run `docker compose down`.
 */
export function composeDown(options: DockerOptions): ExecResult {
	return exec("docker", [...baseArgs(options), "down"]);
}

/**
 * Run `docker compose restart` for the given services.
 */
export function composeRestart(services: string[], options: DockerOptions): ExecResult {
	return exec("docker", [...baseArgs(options), "restart", ...services]);
}

/**
 * Run `docker compose ps`.
 */
export function composePs(options: DockerOptions): ExecResult {
	return exec("docker", [...baseArgs(options), "ps"]);
}

/**
 * Run `docker compose pause`.
 */
export function composePause(options: DockerOptions): ExecResult {
	return exec("docker", [...baseArgs(options), "pause"]);
}

/**
 * Check if a specific service is running according to `docker compose ps`.
 */
export function isServiceRunning(service: string, options: DockerOptions): boolean {
	const result = composePs(options);
	if (result.exitCode !== 0) {
		return false;
	}
	// Parse the tabular output line by line. A service is running if any line
	// contains the service name and the word "running" (case-insensitive).
	const lines = result.stdout.split("\n");
	return lines.some((line) => {
		const lower = line.toLowerCase();
		return lower.includes(service.toLowerCase()) && lower.includes("running");
	});
}

/**
 * Poll an RPC endpoint until it responds to an `eth_chainId` JSON-RPC call.
 *
 * @param url - The RPC URL to poll
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 60000)
 * @param pollIntervalMs - Time between polls in milliseconds (default: 1000)
 */
export async function waitForRpc(
	url: string,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "eth_chainId",
					params: [],
				}),
			});
			if (response.ok) {
				return;
			}
		} catch {
			// RPC not ready yet, retry after interval
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Error(`RPC at ${url} not ready after ${timeoutMs}ms`);
}
