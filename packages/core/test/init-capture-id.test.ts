import { describe, expect, it } from "vitest";
import { resolveInitSnapshotId } from "../src/init/runner.js";

describe("resolveInitSnapshotId", () => {
	it("defaults to the default snapshot id", () => {
		expect(resolveInitSnapshotId({})).toBe("default");
	});

	it("derives the l3-custom id from feeTokenDecimals", () => {
		expect(resolveInitSnapshotId({ feeTokenDecimals: 6 })).toBe("l3-custom-6");
	});

	it("captureId overrides the feeTokenDecimals-derived id", () => {
		expect(resolveInitSnapshotId({ feeTokenDecimals: 6, captureId: "l3-custom-6-published" })).toBe(
			"l3-custom-6-published",
		);
	});

	it("captureId overrides the default id", () => {
		expect(resolveInitSnapshotId({ captureId: "l2" })).toBe("l2");
	});
});
