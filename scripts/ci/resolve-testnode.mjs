import { appendFileSync, readFileSync } from "node:fs";

function defaultImageVersion() {
	const pkg = JSON.parse(readFileSync("apps/cli/package.json", "utf-8"));
	if (!pkg.version) {
		throw new Error("apps/cli/package.json is missing version");
	}
	return `v${pkg.version}`;
}

function readArg(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) {
		return "";
	}
	return process.argv[index + 1] || "";
}

const name = readArg("--name");
let entry = {};
if (name) {
	const config = JSON.parse(readFileSync("config/testnodes.json", "utf-8"));
	entry = config.testnodes?.[name];
	if (!entry) {
		throw new Error(`Unknown testnode name ${name}`);
	}
}

const resolved = {
	version: readArg("--version") || entry.version || defaultImageVersion(),
	"snapshot-version": readArg("--snapshot-version") || entry.snapshotReleaseTag || "",
	variant: readArg("--variant") || entry.variant || "",
	"nitro-contracts-version":
		readArg("--nitro-contracts-version") || entry.nitroContractsVersion || "",
};

if (!resolved["snapshot-version"]) {
	throw new Error("snapshot-version is required (pass --snapshot-version or a --name)");
}
if (!resolved.variant) {
	throw new Error("variant is required (pass --variant or a --name)");
}
if (!resolved["nitro-contracts-version"]) {
	throw new Error(
		"nitro-contracts-version is required (pass --nitro-contracts-version or a --name)",
	);
}

const output = process.env.GITHUB_OUTPUT;
if (!output) {
	throw new Error("GITHUB_OUTPUT is required");
}
for (const [key, value] of Object.entries(resolved)) {
	appendFileSync(output, `${key}=${value}\n`);
}
