import { Cli } from "incur";
import { CLI_METADATA, commandsInGroup } from "./commands/registry.js";

export async function createStartCli() {
	const cli = Cli.create(CLI_METADATA.name, {
		description: CLI_METADATA.description,
		version: CLI_METADATA.version,
	});
	for (const command of commandsInGroup("start")) {
		cli.command(await command.load());
	}
	return cli;
}
