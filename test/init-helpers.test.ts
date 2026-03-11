import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS, isSkippableTokenBridgeError } from "../src/init-helpers.js";

describe("ZERO_ADDRESS", () => {
	it("matches the canonical all-zero address", () => {
		expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
	});
});

describe("isSkippableTokenBridgeError", () => {
	it("matches the known inboxToL1Deployment failure", () => {
		expect(
			isSkippableTokenBridgeError(
				'The contract function "inboxToL1Deployment" returned no data ("0x").',
			),
		).toBe(true);
	});

	it("matches missing token bridge creator errors", () => {
		expect(isSkippableTokenBridgeError("TokenBridgeCreator is not deployed")).toBe(true);
	});

	it("does not match unrelated RPC failures", () => {
		expect(isSkippableTokenBridgeError("RPC at http://127.0.0.1:8547 not ready")).toBe(false);
	});
});
