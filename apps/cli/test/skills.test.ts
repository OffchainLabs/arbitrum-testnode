import { describe, expect, it } from "vitest";
import { buildCommandMap } from "../src/commands/skills.js";

describe("buildCommandMap", () => {
	it("includes every registered command across both groups", async () => {
		const commands = await buildCommandMap();
		const names = [...commands.keys()].sort();

		expect(names).toEqual(
			["clean", "init", "logs", "snapshot", "start", "status", "stop"].sort(),
		);
	});
});
