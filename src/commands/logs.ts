import { resolve } from "node:path";
import { Cli, z } from "incur";
import { loadCurrentRun, readEventLogTail, readTextLogTail } from "../run-logger.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_DIR = resolve(PROJECT_ROOT, "config");

export const logsCli = Cli.create("logs", {
	description: "Show the latest init run logs",
	options: z.object({
		tail: z.string().optional().describe("Number of lines or events to read (default: 50)"),
		raw: z.boolean().optional().describe("Read the plain text output log instead of JSON events"),
	}),
	run(c) {
		const run = loadCurrentRun(CONFIG_DIR);
		if (!run) {
			return { success: false, error: "No init run found" };
		}

		const tail = c.options.tail ? Number(c.options.tail) : 50;
		if (!Number.isFinite(tail) || tail <= 0) {
			return { success: false, error: "tail must be a positive number" };
		}

		if (c.options.raw) {
			return {
				success: true,
				runId: run.runId,
				status: run.status,
				logFile: run.paths.logFile,
				lines: readTextLogTail(run.paths.logFile, tail),
			};
		}

		return {
			success: true,
			runId: run.runId,
			status: run.status,
			eventsFile: run.paths.eventsFile,
			events: readEventLogTail(run.paths.eventsFile, tail),
		};
	},
});
