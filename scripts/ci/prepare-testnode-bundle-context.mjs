import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { prepareTestnodeContext } from "./prepare-testnode-context.mjs";

const CONFIG_PATH = resolve("config", "testnodes.json");
const OUTPUT_DIR = resolve(".testnode-context");

function requireEntryValue(name, key, value) {
	if (!value) {
		throw new Error(`testnodes.${name}.${key} is required`);
	}
	return value;
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
const entries = Object.entries(config.testnodes || {});
if (entries.length === 0) {
	throw new Error(`${CONFIG_PATH} does not define any testnodes`);
}

rmSync(OUTPUT_DIR, { force: true, recursive: true });
mkdirSync(join(OUTPUT_DIR, "testnodes"), { recursive: true });

const metadata = {
	bundled: true,
	defaultTestnodeName: entries[0][0],
};

for (const [name, entry] of entries) {
	const variant = requireEntryValue(name, "variant", entry.variant);
	const snapshotId = requireEntryValue(name, "snapshotId", entry.snapshotId);

	const testnodeOutputDir = join(OUTPUT_DIR, "testnodes", name);
	prepareTestnodeContext({
		containerConfigRoot: `/opt/arbitrum-testnode/testnodes/${name}/runtime-config/`,
		nitroContractsVersion: entry.nitroContractsVersion || "",
		outputDir: testnodeOutputDir,
		snapshotId,
		testnodeName: name,
		variant,
	});
}

writeFileSync(join(OUTPUT_DIR, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
