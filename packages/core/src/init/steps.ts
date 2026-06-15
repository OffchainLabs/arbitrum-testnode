export const BASE_INIT_STEPS = [
	"start-l1",
	"wait-l1",
	"deploy-l2-rollup",
	"generate-l2-config",
	"start-l2",
	"wait-l2",
	"deposit-eth-to-l2",
	"fund-l2owner",
	"deploy-l2-token-bridge",
	"deploy-l3-rollup",
	"generate-l3-config",
	"start-l3",
	"wait-l3",
	"deposit-eth-to-l3",
	"deploy-l3-token-bridge",
] as const;

export const L2_INIT_STEPS = BASE_INIT_STEPS.slice(0, BASE_INIT_STEPS.indexOf("deploy-l3-rollup"));
export const L3_INIT_STEPS = BASE_INIT_STEPS.slice(BASE_INIT_STEPS.indexOf("deploy-l3-rollup"));

export const TIMEBOOST_INIT_STEPS = [
	"deploy-timeboost-auction",
	"restart-l2-timeboost",
	"wait-l2-timeboost",
] as const;

export const INIT_STEPS = [
	...L2_INIT_STEPS.slice(0, L2_INIT_STEPS.indexOf("deploy-l2-token-bridge")),
	...TIMEBOOST_INIT_STEPS,
	...L2_INIT_STEPS.slice(L2_INIT_STEPS.indexOf("deploy-l2-token-bridge")),
	...L3_INIT_STEPS,
] as const;

export function getInitSteps(options?: {
	l3Enabled?: boolean | undefined;
	timeboostEnabled?: boolean | undefined;
}): string[] {
	const l3Enabled = options?.l3Enabled ?? true;
	if (!options?.timeboostEnabled) {
		return l3Enabled ? [...BASE_INIT_STEPS] : [...L2_INIT_STEPS];
	}
	const l3StepNames = new Set<string>(L3_INIT_STEPS);
	return l3Enabled ? [...INIT_STEPS] : [...INIT_STEPS.filter((step) => !l3StepNames.has(step))];
}

export const INIT_STEP_NAMES = [...INIT_STEPS];
