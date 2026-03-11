import { Cli } from "incur";

import { cleanCli } from "./commands/clean.js";
import { initCli } from "./commands/init.js";
import { logsCli } from "./commands/logs.js";
import { startCli } from "./commands/start.js";
import { statusCli } from "./commands/status.js";
import { stopCli } from "./commands/stop.js";

const cli = Cli.create("testnode", {
	description: "Minimal Arbitrum testnode (L1 + L2 + L3)",
	version: "0.1.0",
});

cli.command(initCli);
cli.command(logsCli);
cli.command(startCli);
cli.command(stopCli);
cli.command(cleanCli);
cli.command(statusCli);

cli.serve();
