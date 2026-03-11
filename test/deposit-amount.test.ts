import { describe, expect, it } from "vitest";
import { clampDepositAmount } from "../src/deposit-amount.js";

describe("clampDepositAmount", () => {
	it("returns the desired amount when balance comfortably covers it", () => {
		const result = clampDepositAmount({
			balanceWei: 100n,
			desiredWei: 50n,
			reserveWei: 10n,
		});

		expect(result).toBe(50n);
	});

	it("reduces the deposit to preserve the reserve", () => {
		const result = clampDepositAmount({
			balanceWei: 48n,
			desiredWei: 50n,
			reserveWei: 1n,
		});

		expect(result).toBe(47n);
	});

	it("throws when balance cannot cover the reserve", () => {
		expect(() =>
			clampDepositAmount({
				balanceWei: 1n,
				desiredWei: 50n,
				reserveWei: 2n,
			}),
		).toThrow("Insufficient balance");
	});
});
