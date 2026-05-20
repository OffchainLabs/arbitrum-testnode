import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTokenBridge, createTokenBridgeFetchTokenBridgeContracts } from "@arbitrum/chain-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as execModule from "../src/exec.js";
import {
	deployL2L3TokenBridge,
	getL2ChildWeth,
	parseTokenBridgeCreatorAddress,
} from "../src/token-bridge.js";

const mocks = vi.hoisted(() => ({
	createTokenBridge: vi.fn(),
	createTokenBridgeFetchTokenBridgeContracts: vi.fn(),
	tokenBridgeContracts: {
		parentChainContracts: {
			router: "0xa111111111111111111111111111111111111111",
			standardGateway: "0xa222222222222222222222222222222222222222",
			customGateway: "0xa333333333333333333333333333333333333333",
			wethGateway: "0xa444444444444444444444444444444444444444",
			weth: "0xa555555555555555555555555555555555555555",
			multicall: "0xa666666666666666666666666666666666666666",
		},
		orbitChainContracts: {
			router: "0xb111111111111111111111111111111111111111",
			standardGateway: "0xb222222222222222222222222222222222222222",
			customGateway: "0xb333333333333333333333333333333333333333",
			wethGateway: "0xb444444444444444444444444444444444444444",
			weth: "0xb555555555555555555555555555555555555555",
			multicall: "0xb666666666666666666666666666666666666666",
			proxyAdmin: "0xb777777777777777777777777777777777777777",
			beaconProxyFactory: "0xb888888888888888888888888888888888888888",
			upgradeExecutor: "0xb999999999999999999999999999999999999999",
		},
	},
}));

vi.mock("@arbitrum/chain-sdk", () => ({
	createTokenBridge: mocks.createTokenBridge,
	createTokenBridgeFetchTokenBridgeContracts: mocks.createTokenBridgeFetchTokenBridgeContracts,
}));

vi.mock("../src/exec.js", () => ({
	exec: vi.fn().mockReturnValue({ stdout: "", stderr: "", exitCode: 0 }),
	execOrThrow: vi.fn(),
}));

function isTokenBridgeCreatorDeploy(command: string, args: string[]): boolean {
	return command === "docker" && args.includes("deploy:token-bridge-creator");
}

vi.mock("../src/rpc.js", () => ({
	getBalanceWei: vi.fn().mockResolvedValue(0n),
	readContractOrZero: vi
		.fn()
		.mockImplementation((_addr: string, _abi: unknown, functionName: string) => {
			switch (functionName) {
				case "outbox":
					return "0x7777777777777777777777777777777777777777";
				case "rollupEventInbox":
					return "0x8888888888888888888888888888888888888888";
				case "challengeManager":
					return "0x9999999999999999999999999999999999999999";
				default:
					return "0x0000000000000000000000000000000000000000";
			}
		}),
	publicClient: vi.fn((rpcUrl: string) => ({
		rpcUrl,
		chain: {
			id: rpcUrl.includes(":8549") ? 333333 : rpcUrl.includes(":8547") ? 412346 : 1337,
		},
	})),
	walletClient: vi.fn().mockReturnValue({
		sendTransaction: vi.fn().mockResolvedValue("0x"),
		writeContract: vi.fn().mockResolvedValue("0x"),
	}),
	arbOwnerAbi: [],
	rollupAbi: [],
	erc20Abi: [],
	gatewayRouterAbi: [],
}));

describe("getL2ChildWeth", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-bridge-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("reads the L2 child WETH address from the L1-L2 bridge artifact", () => {
		fs.writeFileSync(
			path.join(tmpDir, "l1l2_network.json"),
			JSON.stringify({
				l2Network: {
					tokenBridge: {
						childWeth: "0x1111111111111111111111111111111111111111",
					},
				},
			}),
		);

		expect(getL2ChildWeth(tmpDir)).toBe("0x1111111111111111111111111111111111111111");
	});

	it("throws when the child WETH address is missing", () => {
		fs.writeFileSync(path.join(tmpDir, "l1l2_network.json"), JSON.stringify({}));

		expect(() => getL2ChildWeth(tmpDir)).toThrow(
			"Missing l2Network.tokenBridge.childWeth in l1l2_network.json",
		);
	});
});

describe("parseTokenBridgeCreatorAddress", () => {
	it("extracts the creator address from deploy output", () => {
		const output = [
			"Deploying token bridge creator...",
			"* L1AtomicTokenBridgeCreator created at address: 0x1111111111111111111111111111111111111111",
			"* TransparentUpgradeableProxy created at address: 0x2222222222222222222222222222222222222222 0x1111111111111111111111111111111111111111 0x3333333333333333333333333333333333333333 0x",
			"Token bridge creator deployed!",
			"L1TokenBridgeCreator: 0x332Fb35767182F8ac9F9C1405db626105F6694E0",
		].join("\n");

		expect(parseTokenBridgeCreatorAddress(output)).toBe(
			"0x2222222222222222222222222222222222222222",
		);
	});

	it("throws when the creator address is missing", () => {
		expect(() => parseTokenBridgeCreatorAddress("no creator here")).toThrow(
			"Failed to parse L1TokenBridgeCreator",
		);
	});
});

describe("deployL2L3TokenBridge", () => {
	let tmpDir: string;
	let previousSdkPath: string | undefined;
	let previousPortalPath: string | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-bridge-test-"));
		vi.clearAllMocks();
		mocks.createTokenBridge.mockResolvedValue({
			tokenBridgeContracts: mocks.tokenBridgeContracts,
		});
		mocks.createTokenBridgeFetchTokenBridgeContracts.mockResolvedValue(mocks.tokenBridgeContracts);
		previousSdkPath = process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"];
		previousPortalPath = process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"];
		process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"] = path.join(tmpDir, "sdk-localNetwork.json");
		process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"] = path.join(
			tmpDir,
			"portal-localNetwork.json",
		);
	});

	afterEach(() => {
		if (previousSdkPath === undefined) {
			// biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies
			delete process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"];
		} else {
			process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"] = previousSdkPath;
		}
		if (previousPortalPath === undefined) {
			// biome-ignore lint/performance/noDelete: process.env requires delete; assigning undefined stringifies
			delete process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"];
		} else {
			process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"] = previousPortalPath;
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("uses the token bridge deployer image for creator deploys on the L2 parent path", async () => {
		fs.writeFileSync(
			path.join(tmpDir, "l3_deployment.json"),
			JSON.stringify({
				rollup: "0x1111111111111111111111111111111111111111",
				inbox: "0x2222222222222222222222222222222222222222",
				bridge: "0x3333333333333333333333333333333333333333",
				"sequencer-inbox": "0x4444444444444444444444444444444444444444",
				"upgrade-executor": "0x5555555555555555555555555555555555555555",
				"validator-wallet-creator": "0x6666666666666666666666666666666666666666",
				"native-token": "0x0000000000000000000000000000000000000000",
				"deployed-at": 44,
			}),
		);
		const execOrThrow = vi.mocked(execModule.execOrThrow);
		execOrThrow.mockImplementation((command, args) => {
			if (isTokenBridgeCreatorDeploy(command, args)) {
				return "L1TokenBridgeCreator: 0x332Fb35767182F8ac9F9C1405db626105F6694E0";
			}
			return "";
		});

		await deployL2L3TokenBridge({
			compose: {
				composeFile: "/tmp/docker-compose.yaml",
				projectName: "arbitrum-testnode",
			},
			configDir: tmpDir,
			rollupAddress: "0x1111111111111111111111111111111111111111",
			rollupOwnerKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
			parentRpc: "http://sequencer:8547",
			childRpc: "http://l3node:8547",
			parentKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
			childKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
			parentWethOverride: "0x5555555555555555555555555555555555555555",
		});

		expect(execOrThrow).toHaveBeenCalledWith(
			"docker",
			expect.arrayContaining([
				"run",
				"--rm",
				"--add-host",
				"host.docker.internal:host-gateway",
				"--workdir",
				"/workspace/token-bridge-contracts",
				"BASECHAIN_RPC=http://host.docker.internal:8547",
				"BASECHAIN_WETH=0x5555555555555555555555555555555555555555",
				"GAS_LIMIT_FOR_L2_FACTORY_DEPLOYMENT=10000000",
				"nitro-testnode-contract-deployer:latest",
				"deploy:token-bridge-creator",
			]),
			expect.objectContaining({ timeout: 600_000 }),
		);
		expect(execOrThrow).not.toHaveBeenCalledWith("env", expect.anything(), expect.anything());
		expect(execOrThrow).not.toHaveBeenCalledWith(
			expect.stringMatching(/(?:^node$|\/node$)/),
			expect.anything(),
			expect.anything(),
		);
		expect(createTokenBridge).toHaveBeenCalledWith(
			expect.objectContaining({
				rollupAddress: "0x1111111111111111111111111111111111111111",
				rollupDeploymentBlockNumber: 44n,
				tokenBridgeCreatorAddressOverride: "0x332Fb35767182F8ac9F9C1405db626105F6694E0",
				parentChainPublicClient: expect.objectContaining({
					rpcUrl: "http://127.0.0.1:8547",
				}),
				orbitChainPublicClient: expect.objectContaining({
					rpcUrl: "http://127.0.0.1:8549",
				}),
				gasOverrides: {
					gasLimit: {
						base: 6_000_000n,
					},
				},
				retryableGasOverrides: {
					maxGasForFactory: {
						base: 20_000_000n,
					},
					maxGasForContracts: {
						base: 20_000_000n,
					},
					maxSubmissionCostForFactory: {
						base: 4_000_000_000_000n,
					},
					maxSubmissionCostForContracts: {
						base: 4_000_000_000_000n,
					},
				},
				setWethGatewayGasOverrides: {
					gasLimit: {
						base: 100_000n,
					},
				},
			}),
		);

		const l2l3Network = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "l2l3_network.json"), "utf-8"),
		) as {
			l3Network: {
				parentChainId: number;
				chainId: number;
				tokenBridge: {
					parentGatewayRouter: string;
					childGatewayRouter: string;
					parentWethGateway: string;
					childWethGateway: string;
				};
			};
		};
		expect(l2l3Network.l3Network.parentChainId).toBe(412346);
		expect(l2l3Network.l3Network.chainId).toBe(333333);
		expect(l2l3Network.l3Network.tokenBridge.parentGatewayRouter).toBe(
			"0xa111111111111111111111111111111111111111",
		);
		expect(l2l3Network.l3Network.tokenBridge.childGatewayRouter).toBe(
			"0xb111111111111111111111111111111111111111",
		);
		expect(l2l3Network.l3Network.tokenBridge.parentWethGateway).toBe(
			"0xa444444444444444444444444444444444444444",
		);
		expect(l2l3Network.l3Network.tokenBridge.childWethGateway).toBe(
			"0xb444444444444444444444444444444444444444",
		);

		const localNetwork = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "localNetwork.json"), "utf-8"),
		) as {
			l3Network: {
				chainId: number;
			};
		};
		expect(localNetwork.l3Network.chainId).toBe(333333);

		const spec = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "l2-l3-chain-config.json"), "utf-8"),
		) as {
			deployment: {
				tokenBridgeCreator: string;
			};
			parentRollupConfig: {
				minimumAssertionPeriod: string;
				confirmPeriodBlocks: string;
			};
			ownership: {
				addChainOwners: string[];
				removeDeployer: boolean;
			};
			parentDeployment: {
				challengeManager: string;
				rollupEventInbox: string;
				outbox: string;
			};
		};
		expect(spec.deployment.tokenBridgeCreator).toBe("0x332Fb35767182F8ac9F9C1405db626105F6694E0");
		expect(spec.parentRollupConfig).toEqual({
			minimumAssertionPeriod: "1",
			confirmPeriodBlocks: "1",
		});
		expect(spec.ownership).toEqual({
			addChainOwners: ["0x5555555555555555555555555555555555555555"],
			removeDeployer: true,
		});
		expect(spec.parentDeployment.outbox).toBe("0x7777777777777777777777777777777777777777");
		expect(spec.parentDeployment.rollupEventInbox).toBe(
			"0x8888888888888888888888888888888888888888",
		);
		expect(spec.parentDeployment.challengeManager).toBe(
			"0x9999999999999999999999999999999999999999",
		);
	});

	it("loads existing token bridge contracts when the SDK retry reports an existing deployment", async () => {
		fs.writeFileSync(
			path.join(tmpDir, "l3_deployment.json"),
			JSON.stringify({
				rollup: "0x1111111111111111111111111111111111111111",
				inbox: "0x2222222222222222222222222222222222222222",
				bridge: "0x3333333333333333333333333333333333333333",
				"sequencer-inbox": "0x4444444444444444444444444444444444444444",
				"upgrade-executor": "0x5555555555555555555555555555555555555555",
				"validator-wallet-creator": "0x6666666666666666666666666666666666666666",
				"native-token": "0x0000000000000000000000000000000000000000",
				"deployed-at": 44,
			}),
		);
		const execOrThrow = vi.mocked(execModule.execOrThrow);
		execOrThrow.mockImplementation((command, args) => {
			if (isTokenBridgeCreatorDeploy(command, args)) {
				return "L1TokenBridgeCreator: 0x332Fb35767182F8ac9F9C1405db626105F6694E0";
			}
			return "";
		});
		mocks.createTokenBridge
			.mockRejectedValueOnce(new Error("Unexpected status for retryable ticket: 0xabc"))
			.mockRejectedValueOnce(
				new Error(
					"Token bridge contracts for Rollup 0x1111111111111111111111111111111111111111 are already deployed",
				),
			);

		await deployL2L3TokenBridge({
			compose: {
				composeFile: "/tmp/docker-compose.yaml",
				projectName: "arbitrum-testnode",
			},
			configDir: tmpDir,
			rollupAddress: "0x1111111111111111111111111111111111111111",
			rollupOwnerKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
			parentRpc: "http://sequencer:8547",
			childRpc: "http://l3node:8547",
			parentKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
			childKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
			parentWethOverride: "0x5555555555555555555555555555555555555555",
		});

		expect(createTokenBridge).toHaveBeenCalledTimes(2);
		expect(createTokenBridgeFetchTokenBridgeContracts).toHaveBeenCalledWith({
			inbox: "0x2222222222222222222222222222222222222222",
			parentChainPublicClient: expect.objectContaining({
				rpcUrl: "http://127.0.0.1:8547",
			}),
			tokenBridgeCreatorAddressOverride: "0x332Fb35767182F8ac9F9C1405db626105F6694E0",
		});
		const l2l3Network = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "l2l3_network.json"), "utf-8"),
		) as {
			l3Network: {
				tokenBridge: {
					parentGatewayRouter: string;
					childGatewayRouter: string;
				};
			};
		};
		expect(l2l3Network.l3Network.tokenBridge.parentGatewayRouter).toBe(
			"0xa111111111111111111111111111111111111111",
		);
		expect(l2l3Network.l3Network.tokenBridge.childGatewayRouter).toBe(
			"0xb111111111111111111111111111111111111111",
		);
	});
});
