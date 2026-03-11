export interface ClampDepositAmountParams {
	balanceWei: bigint;
	desiredWei: bigint;
	reserveWei: bigint;
}

export function clampDepositAmount({
	balanceWei,
	desiredWei,
	reserveWei,
}: ClampDepositAmountParams): bigint {
	if (balanceWei <= reserveWei) {
		throw new Error("Insufficient balance to preserve deposit reserve");
	}

	const availableWei = balanceWei - reserveWei;
	return availableWei < desiredWei ? availableWei : desiredWei;
}
