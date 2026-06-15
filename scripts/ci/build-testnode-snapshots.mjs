import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG_PATH = resolve("config", "testnodes.json");
const PROJECT_ROOT = resolve(".");

run(["pnpm", "--filter", "@arbitrum/testnode-core", "build"]);
const { createInitContext, runInitCommand } = await import(
	"../../packages/core/dist/init-runner.js"
);

function requireEntryValue(name, key, value) {
	if (!value) {
		throw new Error(`testnodes.${name}.${key} is required`);
	}
	return value;
}

function run(args) {
	console.log(`$ ${args.join(" ")}`);
	execFileSync(args[0], args.slice(1), { stdio: "inherit" });
}

function buildInitOptions(name, entry) {
	const variant = requireEntryValue(name, "variant", entry.variant);
	const snapshotId = requireEntryValue(name, "snapshotId", entry.snapshotId);
	const options = { rebuild: true, snapshotId };
	if (variant === "l2") {
		return { ...options, l3Enabled: false };
	}
	if (variant === "l2-timeboost") {
		return { ...options, l3Enabled: false, timeboostEnabled: true };
	}
	const customFeeToken = variant.match(/^l3-custom-(6|16|18|20)$/u);
	if (customFeeToken?.[1]) {
		return { ...options, feeTokenDecimals: Number(customFeeToken[1]) };
	}
	if (variant === "l3-eth") {
		return options;
	}
	throw new Error(`testnodes.${name}.variant is not buildable: ${variant}`);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
const entries = Object.entries(config.testnodes || {});
if (entries.length === 0) {
	throw new Error(`${CONFIG_PATH} does not define any testnodes`);
}

const seen = new Set();
for (const [name, entry] of entries) {
	const snapshotId = requireEntryValue(name, "snapshotId", entry.snapshotId);
	const variant = requireEntryValue(name, "variant", entry.variant);
	const key = `${snapshotId}\t${variant}`;
	if (seen.has(key)) {
		console.log(`[snapshots] Skipping duplicate snapshot ${snapshotId} (${variant})`);
		continue;
	}
	seen.add(key);

	console.log(`[snapshots] Building ${name}: snapshotId=${snapshotId} variant=${variant}`);
	await runInitCommand(buildInitOptions(name, entry), createInitContext(PROJECT_ROOT));
}
