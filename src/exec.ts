import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { logRunEvent } from "./run-logger.js";

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run a command and return the result. Does not throw on non-zero exit codes.
 */
export function exec(
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
): ExecResult {
	const timeout = options?.timeout ?? 120_000;
	const startedAt = Date.now();
	logRunEvent("info", "command.started", `${command} ${args.join(" ")}`, {
		command,
		args,
		cwd: options?.cwd,
		timeout,
	});

	const result: SpawnSyncReturns<string> = spawnSync(command, args, {
		cwd: options?.cwd,
		timeout,
		maxBuffer: 50 * 1024 * 1024,
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	const elapsedMs = Date.now() - startedAt;
	logRunEvent(result.status === 0 ? "info" : "error", "command.finished", `${command} exited`, {
		command,
		args,
		cwd: options?.cwd,
		timeout,
		exitCode: result.status ?? 1,
		elapsedMs,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	});

	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		exitCode: result.status ?? 1,
	};
}

/**
 * Run a command, throw if it fails. Returns stdout.
 */
export function execOrThrow(
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
): string {
	const result = exec(command, args, options);
	if (result.exitCode !== 0) {
		const parts = [result.stderr.trim(), result.stdout.trim()].filter(Boolean);
		const detail = parts.join("\n\nstdout:\n");
		throw new Error(`${command} failed (exit ${result.exitCode}): ${detail}`);
	}
	return result.stdout;
}

/** Run an `arbitrum` CLI command. Throws on failure. */
export function arbitrum(args: string[], options?: { cwd?: string; timeout?: number }): string {
	return execOrThrow("arbitrum", args, options);
}

/** Run an `anvil` command (non-blocking not supported here — use spawn separately). */
export function anvil(args: string[]): ExecResult {
	return exec("anvil", args);
}
