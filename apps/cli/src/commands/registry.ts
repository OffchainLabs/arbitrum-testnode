import type { Cli as IncurCli } from "incur";

export type CommandGroup = "local" | "start";
export type LoadedCommand = IncurCli.Root & { name: string };

export const CLI_METADATA = {
	description: "Minimal Arbitrum testnode (L1 + L2 + L3)",
	name: "testnode",
	version: "0.1.0",
} as const;

export interface CommandEntry {
	group: CommandGroup;
	name: string;
	summary: string;
	load: () => Promise<LoadedCommand>;
}

export const COMMAND_REGISTRY: CommandEntry[] = [
	{
		name: "start",
		summary: "Boot the published testnode image from config with one command",
		group: "start",
		load: async () => (await import("./start.js")).startCli,
	},
	{
		name: "init",
		summary: "Initialize the testnode (L1 + L2 + L3 with bridges)",
		group: "local",
		load: async () => (await import("./init.js")).initCli,
	},
	{
		name: "logs",
		summary: "Show init run logs",
		group: "local",
		load: async () => (await import("./logs.js")).logsCli,
	},
	{
		name: "snapshot",
		summary: "Build or restore snapshots",
		group: "local",
		load: async () => (await import("./snapshot.js")).snapshotCli,
	},
	{
		name: "status",
		summary: "Show service and init state",
		group: "local",
		load: async () => (await import("./status.js")).statusCli,
	},
	{
		name: "stop",
		summary: "Stop services",
		group: "local",
		load: async () => (await import("./stop.js")).stopCli,
	},
	{
		name: "clean",
		summary: "Remove containers and saved data",
		group: "local",
		load: async () => (await import("./clean.js")).cleanCli,
	},
];

export function findCommand(name: string | undefined): CommandEntry | undefined {
	return COMMAND_REGISTRY.find((command) => command.name === name);
}

export function commandsInGroup(group: CommandGroup): CommandEntry[] {
	return COMMAND_REGISTRY.filter((command) => command.group === group);
}
