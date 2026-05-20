import { resolve } from "node:path";
import { exec, execOrThrow } from "./exec.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const CONTRACT_DEPLOYER_DOCKERFILE = resolve(PROJECT_ROOT, "docker/contract-deployer.Dockerfile");

export const CONTRACT_DEPLOYER_IMAGE = "nitro-testnode-contract-deployer:latest";
export const NITRO_CONTRACTS_WORKDIR = "/workspace/nitro-contracts";
export const TOKEN_BRIDGE_CONTRACTS_WORKDIR = "/workspace/token-bridge-contracts";

let contractDeployerImageBuilt = false;

export function ensureContractDeployerImage(): void {
	if (contractDeployerImageBuilt) {
		return;
	}

	if (
		exec("docker", ["image", "inspect", CONTRACT_DEPLOYER_IMAGE], { timeout: 30_000 }).exitCode ===
		0
	) {
		contractDeployerImageBuilt = true;
		return;
	}

	execOrThrow(
		"docker",
		[
			"build",
			"-t",
			CONTRACT_DEPLOYER_IMAGE,
			"-f",
			CONTRACT_DEPLOYER_DOCKERFILE,
			resolve(PROJECT_ROOT, "docker"),
		],
		{ timeout: 1_800_000 },
	);
	
	contractDeployerImageBuilt = true;
}
