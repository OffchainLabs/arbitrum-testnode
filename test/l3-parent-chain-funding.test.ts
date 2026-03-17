import { describe, expect, it } from "vitest";
import { accounts } from "../src/accounts.js";
import { getL3ParentChainFundingPlan } from "../src/l3-parent-chain-funding.js";

describe("getL3ParentChainFundingPlan", () => {
	it("funds the L3 batch poster and validator on the L2 parent chain", () => {
		expect(getL3ParentChainFundingPlan()).toEqual([
			{
				address: accounts.l3sequencer.address,
				amountWei: 10n ** 18n,
				label: "l3sequencer",
			},
			{
				address: accounts.validator.address,
				amountWei: 10n ** 18n,
				label: "validator",
			},
		]);
	});
});
