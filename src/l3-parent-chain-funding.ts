import { accounts } from "./accounts.js";

export interface ParentChainFundingTransfer {
	address: `0x${string}`;
	amountWei: bigint;
	label: string;
}

const ONE_ETH_WEI = 10n ** 18n;

export function getL3ParentChainFundingPlan(): ParentChainFundingTransfer[] {
	return [
		{
			address: accounts.l3sequencer.address,
			amountWei: ONE_ETH_WEI,
			label: "l3sequencer",
		},
		{
			address: accounts.validator.address,
			amountWei: ONE_ETH_WEI,
			label: "validator",
		},
	];
}
