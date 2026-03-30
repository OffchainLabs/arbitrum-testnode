import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { VARIANTS } from "../action/lib.mjs";

function readArg(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) {
		return "";
	}
	return process.argv[index + 1] || "";
}

function requireArg(name) {
	const value = readArg(name);
	if (!value) {
		throw new Error(`Missing required argument ${name}`);
	}
	return value;
}

function walkFiles(path) {
	const entries = readdirSync(path);
	const files = [];
	for (const entry of entries) {
		const fullPath = join(path, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			files.push(...walkFiles(fullPath));
			continue;
		}
		files.push(fullPath);
	}
	return files;
}

function rewriteTree(rootDir, replacements) {
	for (const filePath of walkFiles(rootDir)) {
		const next = replacements.reduce(
			(content, [pattern, value]) => content.replaceAll(pattern, value),
			readFileSync(filePath, "utf-8"),
		);
		writeFileSync(filePath, next);
	}
}

function extractArchive(archivePath, destination) {
	mkdirSync(destination, { recursive: true });
	execFileSync("tar", ["-xf", archivePath, "-C", destination]);
}

const variant = requireArg("--variant");
const definition = VARIANTS[variant];
if (!definition) {
	throw new Error(`Unknown variant ${variant}`);
}

const contractsVersion = readArg("--nitro-contracts-version") || "";
const snapshotId = readArg("--snapshot-id") || definition.snapshotId;
const snapshotDir = resolve(readArg("--snapshot-dir") || join("config", "snapshots", snapshotId));
const outputDir = resolve(readArg("--output-dir") || ".ci-runtime-context");

if (!existsSync(snapshotDir)) {
	throw new Error(`Snapshot directory not found: ${snapshotDir}`);
}

const runtimeConfigDir = join(outputDir, "runtime-config");
const exportConfigDir = join(outputDir, "export-config");
const runtimeDir = join(outputDir, "runtime");
const volumeDir = join(snapshotDir, "volumes");

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });
cpSync(join(snapshotDir, "config"), runtimeConfigDir, { recursive: true });
cpSync(join(snapshotDir, "config"), exportConfigDir, { recursive: true });
cpSync(join(snapshotDir, "anvil-state"), join(runtimeDir, "anvil-state"), { recursive: true });

extractArchive(join(volumeDir, "sequencer-data.tar"), join(runtimeDir, "sequencer", ".arbitrum"));
extractArchive(join(volumeDir, "validator-data.tar"), join(runtimeDir, "validator", ".arbitrum"));
if (definition.l3Enabled) {
	extractArchive(join(volumeDir, "l3node-data.tar"), join(runtimeDir, "l3node", ".arbitrum"));
}

rewriteTree(runtimeConfigDir, [
	["http://host.docker.internal:8545", "http://127.0.0.1:8545"],
	["http://host.docker.internal:8547", "http://127.0.0.1:8547"],
	["http://sequencer:8547", "http://127.0.0.1:8547"],
	["http://l3node:8547", "http://127.0.0.1:8549"],
	["/config/", "/opt/arbitrum-testnode/runtime-config/"],
]);
rewriteTree(exportConfigDir, [
	["http://host.docker.internal:8545", "http://127.0.0.1:8545"],
	["http://host.docker.internal:8547", "http://127.0.0.1:8547"],
	["http://sequencer:8547", "http://127.0.0.1:8547"],
	["http://l3node:8547", "http://127.0.0.1:3347"],
	["http://127.0.0.1:8549", "http://127.0.0.1:3347"],
]);

writeFileSync(
	join(outputDir, "metadata.json"),
	`${JSON.stringify({ l3Enabled: definition.l3Enabled, nitroContractsVersion: contractsVersion, snapshotId, variant }, null, 2)}\n`,
);
