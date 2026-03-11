import * as fs from "node:fs";
import * as path from "node:path";

const STATE_FILENAME = "state.json";

export interface StepResult {
	status: "pending" | "done" | "failed";
	data?: Record<string, unknown>;
	error?: string;
	completedAt?: string;
}

export interface InitState {
	startedAt: string;
	steps: Record<string, StepResult>;
}

export function createState(): InitState {
	return {
		startedAt: new Date().toISOString(),
		steps: {},
	};
}

export function markStepDone(
	state: InitState,
	step: string,
	data?: Record<string, unknown>,
): InitState {
	const stepResult: StepResult = {
		status: "done",
		completedAt: new Date().toISOString(),
	};
	if (data !== undefined) {
		stepResult.data = data;
	}
	return {
		...state,
		steps: {
			...state.steps,
			[step]: stepResult,
		},
	};
}

export function isStepDone(state: InitState, step: string): boolean {
	return state.steps[step]?.status === "done";
}

export function saveState(stateDir: string, state: InitState): void {
	fs.mkdirSync(stateDir, { recursive: true });
	const filePath = path.join(stateDir, STATE_FILENAME);
	fs.writeFileSync(filePath, JSON.stringify(state, null, "\t"), "utf-8");
}

export function loadState(stateDir: string): InitState | null {
	const filePath = path.join(stateDir, STATE_FILENAME);
	if (!fs.existsSync(filePath)) {
		return null;
	}
	const raw = fs.readFileSync(filePath, "utf-8");
	return JSON.parse(raw) as InitState;
}

export function getNextPendingStep(state: InitState, orderedSteps: string[]): string | null {
	for (const step of orderedSteps) {
		if (!isStepDone(state, step)) {
			return step;
		}
	}
	return null;
}

export function markStepFailed(state: InitState, step: string, error: string): InitState {
	return {
		...state,
		steps: {
			...state.steps,
			[step]: {
				status: "failed",
				error,
				completedAt: new Date().toISOString(),
			},
		},
	};
}
