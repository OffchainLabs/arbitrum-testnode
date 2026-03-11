import { describe, expect, it } from "vitest";
import {
	patchGeneratedL2NodeConfig,
	patchGeneratedL3NodeConfig,
} from "../src/node-config-patches.js";

describe("patchGeneratedL2NodeConfig", () => {
	it("relaxes batch poster L1-bound settings for the local L2 runtime", () => {
		const input = {
			chain: {
				"info-json": JSON.stringify([
					{
						rollup: {
							"stake-token": "0x0000000000000000000000000000000000000000",
						},
					},
				]),
			},
			node: {
				"batch-poster": {
					enable: true,
					"max-size": 90000,
					"parent-chain-wallet": {
						"private-key": "old-key",
					},
				},
				staker: {
					"parent-chain-wallet": {
						"private-key": "old-validator",
					},
				},
				"delayed-sequencer": {
					enable: true,
					"finalize-distance": 1,
				},
				dangerous: {
					"disable-blob-reader": false,
				},
			},
		};

		const result = patchGeneratedL2NodeConfig(
			input,
			"0xnew-key",
			"0x1111111111111111111111111111111111111111",
			"0xvalidator-key",
		);

		expect(result.chain).toEqual({
			"info-json": JSON.stringify([
				{
					rollup: {
						"stake-token": "0x1111111111111111111111111111111111111111",
					},
				},
			]),
		});
		expect(result.node).toEqual({
			"batch-poster": {
				enable: true,
				"max-size": 90000,
				"parent-chain-wallet": {
					"private-key": "new-key",
				},
				"l1-block-bound": "ignore",
				"max-delay": "1s",
				"poll-interval": "1s",
				"error-delay": "1s",
				"wait-for-max-delay": false,
				"data-poster": {
					"wait-for-l1-finality": false,
				},
			},
			"delayed-sequencer": {
				enable: true,
				"finalize-distance": 0,
			},
			staker: {
				"disable-challenge": true,
				"parent-chain-wallet": {
					"private-key": "validator-key",
				},
				"use-smart-contract-wallet": true,
			},
			dangerous: {
				"disable-blob-reader": false,
			},
		});
	});
});

describe("patchGeneratedL3NodeConfig", () => {
	it("converts the generated config into the L3 runtime shape", () => {
		const input = {
			chain: {
				"info-json": '[{"chain-id":412347}]',
				name: "L3-Testnode",
			},
			"parent-chain": {
				connection: {
					url: "http://host.docker.internal:8547",
				},
			},
			node: {
				"batch-poster": {
					enable: true,
				},
				dangerous: {
					"disable-blob-reader": false,
				},
				"delayed-sequencer": {
					enable: true,
					"finalize-distance": 1,
				},
			},
			http: {
				addr: "0.0.0.0",
			},
			execution: {},
		};

		const result = patchGeneratedL3NodeConfig(input, "http://sequencer:8547", false);

		expect(result["ensure-rollup-deployment"]).toBe(false);
		expect(result.chain).toEqual({
			id: 412347,
			"info-files": ["/config/l3_chain_info.json"],
			name: "L3-Testnode",
		});
		expect(result["parent-chain"]).toEqual({
			connection: {
				url: "http://sequencer:8547",
			},
		});
		expect(result.node).toEqual({
			"batch-poster": {
				enable: true,
				"l1-block-bound": "ignore",
				"max-delay": "1s",
				"poll-interval": "1s",
				"error-delay": "1s",
				"wait-for-max-delay": false,
				"redis-url": "",
				"data-poster": {
					"wait-for-l1-finality": false,
				},
			},
			bold: {
				"rpc-block-number": "latest",
				"assertion-posting-interval": "1s",
				"assertion-confirming-interval": "1s",
				"assertion-scanning-interval": "1s",
				"minimum-gap-to-parent-assertion": "1s",
				"parent-chain-block-time": "1s",
			},
			dangerous: {
				"disable-blob-reader": true,
			},
			"delayed-sequencer": {
				enable: true,
				"finalize-distance": 0,
			},
			staker: {
				enable: false,
				"use-smart-contract-wallet": true,
				"disable-challenge": true,
				"staker-interval": "1s",
				"make-assertion-interval": "1s",
			},
		});
		expect(result.execution).toEqual({ "forwarding-target": "null" });
		expect(result.persistent).toEqual({ chain: "local" });
		expect(result.ws).toEqual({ addr: "0.0.0.0" });
	});
});
