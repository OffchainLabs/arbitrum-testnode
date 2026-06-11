import { describe, expect, it } from "vitest";
import { buildStartTestnodeState, testnodeDockerRunArgs } from "../src/index.js";

describe("buildStartTestnodeState", () => {
	it("defaults to the local L3 variant and cwd-scoped output dir", () => {
		const state = buildStartTestnodeState({
			cwd: "/workspace/project",
			l3Enabled: true,
			version: "v1.2.3",
		});

		expect(state.variant).toBe("l3-eth");
		expect(state.outputDir).toBe("/workspace/project/.arbitrum-testnode/v1.2.3/l3-eth");
		expect(state.configDir).toBe("/workspace/project/.arbitrum-testnode/v1.2.3/l3-eth/config");
		expect(state.rpcUrls.l1).toBe("http://127.0.0.1:8545");
		expect(state.rpcUrls.l2).toBe("http://127.0.0.1:8547");
		expect(state.rpcUrls.l3).toBe("http://127.0.0.1:3347");
	});

	it("supports the local L2-only variant", () => {
		const state = buildStartTestnodeState({
			cwd: "/workspace/project",
			l3Enabled: false,
			version: "v1.2.3",
		});

		expect(state.variant).toBe("l2");
		expect(state.rpcUrls.l3).toBe("");
		expect(state.paths.l2BridgeUiConfig).toBe("");
		expect(state.paths.l2l3Network).toBe("");
	});

	it("enables Timeboost", () => {
		const state = buildStartTestnodeState({
			containerName: "custom-testnode",
			cwd: "/workspace/project",
			l3Enabled: true,
			timeboostEnabled: true,
			version: "v1.2.3",
		});

		expect(state.variant).toBe("l2-timeboost");
		expect(state.outputDir).toBe("/workspace/project/.arbitrum-testnode/v1.2.3/l2-timeboost");
		expect(state.imageRef).toBe(
			"ghcr.io/offchainlabs/arbitrum-testnode-ci:v1.2.3-nc3.2-l2-timeboost",
		);
		expect(state.rpcUrls.l3).toBe("");
		const args = testnodeDockerRunArgs(state);
		expect(args).toEqual(
			expect.arrayContaining([
				"TESTNODE_TIMEBOOST=true",
				"TESTNODE_TIMEBOOST_REDIS_URL",
				"TESTNODE_TIMEBOOST_AUCTION_CONTRACT_ADDRESS",
			]),
		);
		expect(args).not.toContain("redis://timeboost-redis:6379");
		expect(args).not.toContain("redis:7-alpine");
	});
});
