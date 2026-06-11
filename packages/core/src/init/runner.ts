import type { ChildProcess } from "node:child_process";
import { waitForRpc } from "../docker.js";
import {
	finishActiveRun,
	logRunEvent,
	startDetachedInitRun,
	startInlineRunLogging,
	startRunLoggingFromEnv,
	updateRunStep,
} from "../run-logger.js";
import {
	resetRuntime,
	startAnvilWithState,
	startNitroFromSnapshot,
	stopRuntime,
} from "../runtime.js";
import { installSnapshotRelease } from "../snapshot-release.js";
import {
	DEFAULT_SNAPSHOT_ID,
	captureSnapshot,
	hasSnapshot,
	restoreSnapshot,
	verifySnapshotSemanticState,
} from "../snapshot.js";
import { createState, getNextPendingStep, loadState, markStepFailed, saveState } from "../state.js";
import { makeStepRunners } from "./chain-steps.js";
import { type InitContext, type InitRuntime, createInitRuntime } from "./context.js";
import { INIT_STEP_NAMES, getInitSteps } from "./steps.js";

export { createInitContext, type InitContext } from "./context.js";

const L1_RPC = "http://127.0.0.1:8545";
const L2_RPC = "http://127.0.0.1:8547";
const L3_RPC = "http://127.0.0.1:8549";

let _anvilProcess: ChildProcess | undefined;

async function runInitLoop(
	runtime: InitRuntime,
	feeTokenDecimals?: number,
	rebuild?: boolean,
	timeboostEnabled?: boolean,
): Promise<{
	success: boolean;
	failedStep?: string;
	error?: string;
	timings?: Record<string, number>;
	steps: string[];
}> {
	let state = rebuild ? createState() : (loadState(runtime.configDir) ?? createState());
	const runners = makeStepRunners(runtime, feeTokenDecimals);
	const steps = getInitSteps({ timeboostEnabled });
	const timings: Record<string, number> = {};

	let nextStep = getNextPendingStep(state, steps);
	while (nextStep !== null) {
		const stepStart = Date.now();
		console.log(`[init] Running step: ${nextStep}`);
		updateRunStep(nextStep);
		logRunEvent("info", "step.started", `Running step ${nextStep}`, { step: nextStep });
		const runner = runners[nextStep];
		if (!runner) {
			throw new Error(`Unknown step: ${nextStep}`);
		}
		try {
			state = await runner(state);
			const elapsed = Date.now() - stepStart;
			timings[nextStep] = elapsed;
			saveState(runtime.configDir, state);
			console.log(`[init] Step done: ${nextStep} (${(elapsed / 1000).toFixed(1)}s)`);
			logRunEvent("info", "step.completed", `Step ${nextStep} completed`, {
				step: nextStep,
				elapsedMs: elapsed,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			state = markStepFailed(state, nextStep, msg);
			saveState(runtime.configDir, state);
			console.error(`[init] Step failed: ${nextStep} - ${msg}`);
			logRunEvent("error", "step.failed", `Step ${nextStep} failed`, {
				step: nextStep,
				error: msg,
			});
			return { success: false, failedStep: nextStep, error: msg, timings, steps };
		}
		nextStep = getNextPendingStep(state, steps);
	}

	return { success: true, timings, steps };
}

export { INIT_STEP_NAMES };

export interface InitCommandOptions {
	background?: boolean | undefined;
	feeTokenDecimals?: number | undefined;
	foreground?: boolean | undefined;
	rebuild?: boolean | undefined;
	snapshotVersion?: string | undefined;
	timeboostEnabled?: boolean | undefined;
}

export async function runInitCommand(options: InitCommandOptions, context: InitContext) {
	const runtime = createInitRuntime(context);
	const { feeTokenDecimals } = options;
	assertValidFeeTokenDecimals(feeTokenDecimals);
	const snapshotId =
		feeTokenDecimals !== undefined ? `l3-custom-${feeTokenDecimals}` : DEFAULT_SNAPSHOT_ID;

	if (options.background && !options.foreground) {
		return startBackgroundInit(runtime, {
			snapshotVersion: options.snapshotVersion,
			feeTokenDecimals,
			timeboostEnabled: options.timeboostEnabled,
		});
	}

	try {
		return await runInitForeground(runtime, options, snapshotId, feeTokenDecimals);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		finishActiveRun("failed", { exitCode: 1, error: message });
		throw err;
	}
}

async function runInitForeground(
	runtime: InitRuntime,
	options: {
		foreground?: boolean | undefined;
		rebuild?: boolean | undefined;
		snapshotVersion?: string | undefined;
		timeboostEnabled?: boolean | undefined;
	},
	snapshotId: string,
	feeTokenDecimals: number | undefined,
) {
	const totalStart = Date.now();
	const hasExistingInitState = loadState(runtime.configDir) !== null;
	await ensureSnapshotInstalledIfNeeded(
		runtime,
		snapshotId,
		options.rebuild || hasExistingInitState,
		options.snapshotVersion,
	);
	const shouldRestoreSnapshot =
		!options.rebuild && !hasExistingInitState && hasSnapshot(runtime.configDir, snapshotId);
	const logArgs = options.foreground ? ["init", "--foreground"] : ["init"];

	if (shouldRestoreSnapshot) {
		return runSnapshotRestoreFlow(runtime, snapshotId, logArgs, totalStart);
	}

	if (options.rebuild) {
		console.log("[init] Resetting runtime data for rebuild...");
		resetRuntime({
			composeFile: runtime.composeFile,
			projectName: runtime.projectName,
			configDir: runtime.configDir,
		});
	}

	startRunLoggingFromEnv(runtime.configDir) ?? startInlineRunLogging(runtime.configDir, logArgs);
	const result = await runInitLoop(
		runtime,
		feeTokenDecimals,
		options.rebuild,
		options.timeboostEnabled,
	);
	const totalElapsed = Date.now() - totalStart;
	logInitTimeline(result.timings, totalElapsed);

	if (!result.success) {
		return finishFailedInit(result);
	}

	return finalizeFreshInit(runtime, snapshotId, totalStart, result.steps);
}

function finishFailedInit(result: {
	error?: string | undefined;
	failedStep?: string | undefined;
}) {
	finishActiveRun("failed", {
		exitCode: 1,
		...(result.error ? { error: result.error } : {}),
		...(result.failedStep ? { failedStep: result.failedStep } : {}),
	});
	return { success: false as const, failedStep: result.failedStep, error: result.error };
}

function assertValidFeeTokenDecimals(feeTokenDecimals: number | undefined): void {
	if (
		feeTokenDecimals !== undefined &&
		feeTokenDecimals !== 6 &&
		feeTokenDecimals !== 16 &&
		feeTokenDecimals !== 18 &&
		feeTokenDecimals !== 20
	) {
		throw new Error("--fee-token-decimals must be 6, 16, 18, or 20");
	}
}

function startBackgroundInit(
	runtime: InitRuntime,
	params: {
		snapshotVersion: string | undefined;
		feeTokenDecimals: number | undefined;
		timeboostEnabled: boolean | undefined;
	},
) {
	const extraArgs = [
		...(params.snapshotVersion ? ["--snapshot-version", params.snapshotVersion] : []),
		...(params.feeTokenDecimals !== undefined
			? ["--fee-token-decimals", String(params.feeTokenDecimals)]
			: []),
		...(params.timeboostEnabled ? ["--timeboost-enabled"] : []),
	];
	const run = startDetachedInitRun(runtime.configDir, runtime.projectRoot, extraArgs);
	return {
		success: true as const,
		detached: true,
		runId: run.runId,
		pid: run.pid,
		status: run.status,
		logFile: run.paths.logFile,
		eventsFile: run.paths.eventsFile,
	};
}

async function ensureSnapshotInstalledIfNeeded(
	runtime: InitRuntime,
	snapshotId: string,
	rebuild: boolean | undefined,
	snapshotVersion: string | undefined,
): Promise<void> {
	if (rebuild || hasSnapshot(runtime.configDir, snapshotId)) {
		return;
	}
	console.log(`[init] Installing snapshot release ${snapshotVersion ?? "latest"}...`);
	const install = await installSnapshotRelease({
		composeFile: runtime.composeFile,
		configDir: runtime.configDir,
		...(snapshotVersion ? { version: snapshotVersion } : {}),
	});
	console.log(
		`[init] Installed snapshot ${install.releaseTag ?? install.archiveName} from ${install.sourceUrl}`,
	);
}

async function runSnapshotRestoreFlow(
	runtime: InitRuntime,
	snapshotId: string,
	logArgs: string[],
	totalStart: number,
) {
	console.log(`[init] Restoring snapshot: ${snapshotId}`);
	stopRuntime({
		composeFile: runtime.composeFile,
		projectName: "arbitrum-testnode",
		configDir: runtime.configDir,
	});
	restoreSnapshot(runtime.configDir, snapshotId);
	startRunLoggingFromEnv(runtime.configDir) ?? startInlineRunLogging(runtime.configDir, logArgs);
	_anvilProcess = startAnvilWithState(runtime.configDir);
	await waitForRpc(L1_RPC);
	await startNitroFromSnapshot(
		{
			composeFile: runtime.composeFile,
			projectName: "arbitrum-testnode",
			configDir: runtime.configDir,
		},
		{ l1: L1_RPC, l2: L2_RPC, l3: L3_RPC },
	);
	await verifySnapshotSemanticState(runtime.configDir, { l1: L1_RPC, l2: L2_RPC, l3: L3_RPC });
	const totalElapsed = Date.now() - totalStart;
	finishActiveRun("completed", { exitCode: 0 });
	return {
		success: true as const,
		restoredSnapshot: snapshotId,
		totalSeconds: totalElapsed / 1000,
	};
}

function logInitTimeline(timings: Record<string, number> | undefined, totalElapsed: number): void {
	if (!timings) {
		return;
	}
	console.log("\n[init] Timeline:");
	for (const [step, ms] of Object.entries(timings)) {
		console.log(`  ${step}: ${(ms / 1000).toFixed(1)}s`);
	}
	console.log(`  TOTAL: ${(totalElapsed / 1000).toFixed(1)}s`);
}

async function finalizeFreshInit(
	runtime: InitRuntime,
	snapshotId: string,
	totalStart: number,
	steps: string[],
) {
	stopRuntime({
		composeFile: runtime.composeFile,
		projectName: "arbitrum-testnode",
		configDir: runtime.configDir,
	});
	const snapshot = captureSnapshot(runtime.configDir, runtime.composeFile, snapshotId);
	_anvilProcess = startAnvilWithState(runtime.configDir);
	await waitForRpc(L1_RPC);
	await startNitroFromSnapshot(
		{
			composeFile: runtime.composeFile,
			projectName: "arbitrum-testnode",
			configDir: runtime.configDir,
		},
		{ l1: L1_RPC, l2: L2_RPC, l3: L3_RPC },
	);
	await verifySnapshotSemanticState(runtime.configDir, { l1: L1_RPC, l2: L2_RPC, l3: L3_RPC });
	const totalElapsed = Date.now() - totalStart;
	finishActiveRun("completed", { exitCode: 0 });
	return {
		success: true as const,
		stepsCompleted: steps.length,
		totalSeconds: totalElapsed / 1000,
		snapshotId: snapshot.snapshotId,
	};
}
