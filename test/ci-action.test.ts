import { describe, expect, it } from "vitest";
import {
	DEFAULT_CONTRACTS_VERSION,
	DEFAULT_IMAGE_REPOSITORY,
	buildActionState,
	buildImageRef,
	normalizeContractsVersion,
	resolveVariant,
} from "../scripts/action/lib.mjs";

describe("resolveVariant", () => {
	it("uses l2 when l3 is disabled", () => {
		expect(resolveVariant({ l3Node: "false" })).toBe("l2");
	});

	it("uses l3-eth when l3 is enabled without a fee token", () => {
		expect(resolveVariant({ l3Node: "true" })).toBe("l3-eth");
	});

	it("uses the custom gas token variants when decimals are provided", () => {
		expect(resolveVariant({ feeTokenDecimals: "16", l3Node: "true" })).toBe("l3-custom-16");
		expect(resolveVariant({ feeTokenDecimals: "18", l3Node: "true" })).toBe("l3-custom-18");
		expect(resolveVariant({ feeTokenDecimals: "20", l3Node: "true" })).toBe("l3-custom-20");
	});

	it("rejects custom fee token decimals when l3 is disabled", () => {
		expect(() => resolveVariant({ feeTokenDecimals: "18", l3Node: "false" })).toThrow(
			"fee-token-decimals requires l3-node=true",
		);
	});
});

describe("buildImageRef", () => {
	it("uses the default repository when none is provided", () => {
		expect(buildImageRef({ contractsVersion: "v3.2", variant: "l3-eth", version: "v1.2.3" })).toBe(
			`${DEFAULT_IMAGE_REPOSITORY}:v1.2.3-nc3.2-l3-eth`,
		);
	});
});

describe("buildActionState", () => {
	it("builds stable paths and RPC URLs for l3 variants", () => {
		const state = buildActionState({
			contractsVersion: "v3.2",
			l3Node: "true",
			runnerTemp: "/tmp/runner",
			version: "v1.2.3",
		});

		expect(state.variant).toBe("l3-eth");
		expect(state.contractsVersion).toBe("v3.2");
		expect(state.imageRef).toContain("nc3.2");
		expect(state.outputDir).toBe("/tmp/runner/arbitrum-testnode/v1.2.3/l3-eth");
		expect(state.paths.localNetwork).toBe(
			"/tmp/runner/arbitrum-testnode/v1.2.3/l3-eth/config/localNetwork.json",
		);
		expect(state.rpcUrls.l1).toBe("http://127.0.0.1:8545");
		expect(state.rpcUrls.l2).toBe("http://127.0.0.1:8547");
		expect(state.rpcUrls.l3).toBe("http://127.0.0.1:3347");
	});

	it("omits l3-specific outputs for l2", () => {
		const state = buildActionState({
			contractsVersion: "v3.2",
			l3Node: "false",
			runnerTemp: "/tmp/runner",
			version: "v1.2.3",
		});

		expect(state.variant).toBe("l2");
		expect(state.contractsVersion).toBe("v3.2");
		expect(state.imageRef).toContain("nc3.2");
		expect(state.paths.l2BridgeUiConfig).toBe("");
		expect(state.paths.l2l3Network).toBe("");
		expect(state.rpcUrls.l3).toBe("");
	});

	it("resolves a relative output dir against the workspace", () => {
		const state = buildActionState({
			contractsVersion: "v3.2",
			l3Node: "true",
			outputDir: "./shadow-testnode-output",
			version: "v1.2.3",
			workspace: "/workspace/sdk-shadow",
		});

		expect(state.outputDir).toBe("/workspace/sdk-shadow/shadow-testnode-output");
		expect(state.configDir).toBe("/workspace/sdk-shadow/shadow-testnode-output/config");
	});

	it("defaults to v3.2 when contractsVersion is not provided", () => {
		const state = buildActionState({
			l3Node: "true",
			runnerTemp: "/tmp/runner",
			version: "v1.2.3",
		});

		expect(state.contractsVersion).toBe(DEFAULT_CONTRACTS_VERSION);
		expect(state.imageRef).toContain("nc3.2");
	});

	it("rejects invalid contracts versions", () => {
		expect(() => normalizeContractsVersion("v9.9")).toThrow(
			"nitro-contracts-version must be one of: v2.1, v3.2",
		);
	});
});
