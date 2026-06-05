#!/usr/bin/env node

import { CLI_METADATA, COMMAND_REGISTRY, findCommand } from "./commands/registry.js";

async function run(argv = process.argv.slice(2)): Promise<void> {
	const [command] = argv;

	const entry = findCommand(command);
	if (entry?.group === "start") {
		const { createStartCli } = await import("./start-cli.js");
		await (await createStartCli()).serve(argv);
		return;
	}

	if (!command || command === "--help" || command === "-h" || command === "help") {
		printTopLevelHelp();
		return;
	}

	if (command === "--version" || command === "-v") {
		process.stdout.write(`${CLI_METADATA.version}\n`);
		return;
	}

	if (entry?.group === "local") {
		const { createLocalCli } = await import("./local-cli.js");
		await (await createLocalCli()).serve(argv);
		return;
	}

	printTopLevelHelp();
	process.stderr.write(`\nUnknown command: ${command}\n`);
	process.exitCode = 1;
}

function printTopLevelHelp(): void {
	process.stdout.write(`${CLI_METADATA.description}

Usage:
  ${CLI_METADATA.name} <command> [options]

Commands:
${formatCommandHelp()}

Options:
  -h, --help     Show help
  -v, --version  Show version
`);
}

function formatCommandHelp(): string {
	const width = Math.max(...COMMAND_REGISTRY.map((command) => command.name.length));
	return COMMAND_REGISTRY.map(
		(command) => `  ${command.name.padEnd(width)}  ${command.summary}`,
	).join("\n");
}

run().catch((error) => {
	process.stderr.write(
		`${error instanceof Error ? error.stack || error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
