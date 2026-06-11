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

export const TIMEBOOST_INIT_STEPS = [
	"deploy-timeboost-auction",
	"restart-l2-timeboost",
	"wait-l2-timeboost",
] as const;

export const INIT_STEPS = [
	...BASE_INIT_STEPS.slice(0, 8),
	...TIMEBOOST_INIT_STEPS,
	...BASE_INIT_STEPS.slice(8),
] as const;

export function getInitSteps(options?: { timeboostEnabled?: boolean | undefined }): string[] {
	if (!options?.timeboostEnabled) {
		return [...BASE_INIT_STEPS];
	}
	return [...INIT_STEPS];
}

export const INIT_STEP_NAMES = [...INIT_STEPS];
