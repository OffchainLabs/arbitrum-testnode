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
			address: accounts.l3BatchPoster.address,
			amountWei: ONE_ETH_WEI,
			label: "l3BatchPoster",
		},
		{
			address: accounts.l3Validator.address,
			amountWei: ONE_ETH_WEI,
			label: "l3Validator",
		},
	];
}
