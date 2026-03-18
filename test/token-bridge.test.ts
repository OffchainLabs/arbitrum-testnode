import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as execModule from "../src/exec.js";
import {
	deployL2L3TokenBridge,
	getL2ChildWeth,
	parseTokenBridgeCreatorAddress,
} from "../src/token-bridge.js";

vi.mock("../src/exec.js", () => ({
	execOrThrow: vi.fn(),
}));

vi.mock("../src/rpc.js", () => ({
	getBalanceWei: vi.fn().mockResolvedValue(0n),
	readContractOrZero: vi.fn().mockImplementation(
		(_addr: string, _abi: unknown, functionName: string) => {
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
		},
	),
	publicClient: vi.fn(),
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

	let previousAdminCliEntry: string | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-bridge-test-"));
		vi.clearAllMocks();
		previousSdkPath = process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"];
		previousPortalPath = process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"];
		previousAdminCliEntry = process.env["ARBITRUM_ADMIN_CLI_ENTRY"];
		process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"] = path.join(tmpDir, "sdk-localNetwork.json");
		process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"] = path.join(
			tmpDir,
			"portal-localNetwork.json",
		);
		process.env["ARBITRUM_ADMIN_CLI_ENTRY"] = "/test/admin-cli/dist/index.cjs";
	});

	afterEach(() => {
		if (previousSdkPath === undefined) {
			delete process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"];
		} else {
			process.env["ARBITRUM_SDK_LOCAL_NETWORK_PATH"] = previousSdkPath;
		}
		if (previousPortalPath === undefined) {
			delete process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"];
		} else {
			process.env["ARBITRUM_PORTAL_LOCAL_NETWORK_PATH"] = previousPortalPath;
		}
		if (previousAdminCliEntry === undefined) {
			delete process.env["ARBITRUM_ADMIN_CLI_ENTRY"];
		} else {
			process.env["ARBITRUM_ADMIN_CLI_ENTRY"] = previousAdminCliEntry;
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("uses the local token-bridge workspace for creator deploys on the L2 parent path", async () => {
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
			if (
				(command === "docker" && args.includes("deploy:token-bridge-creator")) ||
				(command === "env" && args.includes("deploy:token-bridge-creator"))
			) {
				return "L1TokenBridgeCreator: 0x332Fb35767182F8ac9F9C1405db626105F6694E0";
			}

			if (command === "node" || command.endsWith("/node")) {
				const outputDirIndex = args.indexOf("--output-dir");
				const outputDir = args[outputDirIndex + 1];
				if (!outputDir) {
					throw new Error("missing --output-dir path");
				}
				fs.mkdirSync(outputDir, { recursive: true });
				fs.writeFileSync(
					path.join(outputDir, "bridgeUiConfig.json"),
					JSON.stringify({
						chainName: "orbit-dev-test",
						parentChainId: 412346,
						chainId: 333333,
						rollup: "0x1111111111111111111111111111111111111111",
						parentChainRpc: "http://127.0.0.1:8547",
						chainRpc: "http://127.0.0.1:8549",
						nativeToken: "0x0000000000000000000000000000000000000000",
						coreContracts: {
							bridge: "0x3333333333333333333333333333333333333333",
							inbox: "0x2222222222222222222222222222222222222222",
							outbox: "0x7777777777777777777777777777777777777777",
							rollup: "0x1111111111111111111111111111111111111111",
							sequencerInbox: "0x4444444444444444444444444444444444444444",
						},
						tokenBridge: {
							parentChain: {
								router: "0xa111111111111111111111111111111111111111",
								standardGateway: "0xa222222222222222222222222222222222222222",
								customGateway: "0xa333333333333333333333333333333333333333",
								wethGateway: "0xa444444444444444444444444444444444444444",
								weth: "0xa555555555555555555555555555555555555555",
								multicall: "0xa666666666666666666666666666666666666666",
								proxyAdmin: "0xa777777777777777777777777777777777777777",
							},
							chain: {
								router: "0xb111111111111111111111111111111111111111",
								standardGateway: "0xb222222222222222222222222222222222222222",
								customGateway: "0xb333333333333333333333333333333333333333",
								wethGateway: "0xb444444444444444444444444444444444444444",
								weth: "0xb555555555555555555555555555555555555555",
								multicall: "0xb666666666666666666666666666666666666666",
								proxyAdmin: "0xb777777777777777777777777777777777777777",
							},
						},
					}),
				);
				return JSON.stringify({ ok: true });
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
			"env",
			expect.arrayContaining([
				"BASECHAIN_RPC=http://127.0.0.1:8547",
				"BASECHAIN_WETH=0x5555555555555555555555555555555555555555",
				"DEPLOY_GAS_LIMIT=50000000",
				"GAS_LIMIT_FOR_L2_FACTORY_DEPLOYMENT=10000000",
				"yarn",
				"deploy:token-bridge-creator",
			]),
			expect.objectContaining({
				cwd: expect.any(String),
			}),
		);
		expect(execOrThrow).toHaveBeenCalledWith(
			expect.stringMatching(/(?:^node$|\/node$)/),
			expect.arrayContaining([
				"/test/admin-cli/dist/index.cjs",
				"deploy",
				"child",
				"--config",
				path.join(tmpDir, "l2-l3-chain-config.json"),
				"--private-key",
				"0x2222222222222222222222222222222222222222222222222222222222222222",
				"--yes",
				"--output-dir",
				path.join(tmpDir, "l2-l3-admin"),
			]),
			expect.anything(),
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
});
