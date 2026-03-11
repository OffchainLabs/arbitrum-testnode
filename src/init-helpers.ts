const SKIPPABLE_TOKEN_BRIDGE_PATTERNS = [
	"inboxtol1deployment",
	"returned no data",
	"tokenbridgecreator",
	"token bridge creator",
] as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function isSkippableTokenBridgeError(message: string): boolean {
	const normalized = message.toLowerCase();
	return SKIPPABLE_TOKEN_BRIDGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}
