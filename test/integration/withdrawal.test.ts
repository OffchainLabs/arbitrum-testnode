import type { Address } from "viem";
import { parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { accounts } from "../../src/accounts.js";
import { publicClient, rollupAbi } from "../../src/rpc.js";
import { executeWithdrawal } from "../../src/withdraw.js";

async function getOutboxAddress(rollupAddress: Address, rpcUrl: string): Promise<Address> {
	return publicClient(rpcUrl).readContract({
		address: rollupAddress,
		abi: rollupAbi,
		functionName: "outbox",
	});
}

// Rollup addresses from deployment artifacts
const L2_ROLLUP: Address = "0xD0B8D2BA3e2ac9AA58b8D9BB1887dC9F7649C5C8";
const L3_ROLLUP: Address = "0x9D8DBFe48DeB6fe3254b44A52bD420f94E65Eda5";

describe("withdrawal speed", () => {
	it("L2→L1 ETH withdrawal completes within 30 seconds", async () => {
		const outboxAddress = await getOutboxAddress(L2_ROLLUP, "http://127.0.0.1:8545");

		const result = await executeWithdrawal({
			childRpcUrl: "http://127.0.0.1:8547",
			parentRpcUrl: "http://127.0.0.1:8545",
			privateKey: accounts.funnel.privateKey,
			amount: parseEther("0.01"),
			outboxAddress,
			pollIntervalMs: 1000,
			timeoutMs: 30_000,
		});

		expect(result.durationMs).toBeLessThan(30_000);
		console.log(`L2→L1 withdrawal completed in ${result.durationMs}ms`);
	});

	it("L3→L2 ETH withdrawal completes within 30 seconds", async () => {
		const outboxAddress = await getOutboxAddress(L3_ROLLUP, "http://127.0.0.1:8547");

		const result = await executeWithdrawal({
			childRpcUrl: "http://127.0.0.1:8549",
			parentRpcUrl: "http://127.0.0.1:8547",
			privateKey: accounts.funnel.privateKey,
			amount: parseEther("0.001"),
			outboxAddress,
			pollIntervalMs: 1000,
			timeoutMs: 30_000,
		});

		expect(result.durationMs).toBeLessThan(30_000);
		console.log(`L3→L2 withdrawal completed in ${result.durationMs}ms`);
	});
});
