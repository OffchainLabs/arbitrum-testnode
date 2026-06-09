export const INIT_STEPS = [
	"start-l1",
	"wait-l1",
	"deploy-l2-rollup",
	"generate-l2-config",
	"start-l2",
	"wait-l2",
	"deposit-eth-to-l2",
	"deploy-l2-token-bridge",
	"deploy-l3-rollup",
	"generate-l3-config",
	"start-l3",
	"wait-l3",
	"deposit-eth-to-l3",
	"deploy-l3-token-bridge",
] as const;

export const INIT_STEP_NAMES = [...INIT_STEPS];
