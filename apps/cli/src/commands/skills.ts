import { Cli, SyncSkills } from "incur";
import { createLocalCli } from "../local-cli.js";
import { createStartCli } from "../start-cli.js";
import { CLI_METADATA } from "./registry.js";

type CommandEntry = NonNullable<ReturnType<(typeof Cli.toCommands)["get"]>> extends Map<
	string,
	infer V
>
	? V
	: never;

/** Merges every registered command (start + local groups) into one incur command map. */
export async function buildCommandMap(): Promise<Map<string, CommandEntry>> {
	const merged = new Map<string, CommandEntry>();
	for (const cli of [await createStartCli(), await createLocalCli()]) {
		const commands = Cli.toCommands.get(cli);
		if (!commands) continue;
		for (const [name, entry] of commands) {
			merged.set(name, entry);
		}
	}
	return merged;
}

/** Generates skill files from the full command surface and installs them natively. */
export async function runSkillsAdd(): Promise<void> {
	const commands = await buildCommandMap();
	const result = await SyncSkills.sync(CLI_METADATA.name, commands, {
		description: CLI_METADATA.description,
	});

	const count = result.skills.length;
	process.stdout.write(`${count} skill${count === 1 ? "" : "s"} synced\n`);
	for (const path of result.paths) {
		process.stdout.write(`  ${path}\n`);
	}
}
