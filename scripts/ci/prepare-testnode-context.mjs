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
import { fileURLToPath } from "node:url";
import { VARIANTS } from "../../packages/testnode/src/runtime.mjs";

function readArg(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) {
		return "";
	}
	return process.argv[index + 1] || "";
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

export function prepareTestnodeContext({
	containerConfigRoot,
	nitroContractsVersion = "",
	outputDir,
	snapshotDir,
	snapshotId,
	testnodeName = "",
	variant,
}) {
	if (!variant) {
		throw new Error("Missing required argument --variant");
	}
	if (!snapshotId) {
		throw new Error("Missing required argument --snapshot-id");
	}
	if (!outputDir) {
		throw new Error("Missing required outputDir");
	}
	if (!containerConfigRoot) {
		throw new Error("Missing required containerConfigRoot");
	}
	const definition = VARIANTS[variant];
	if (!definition) {
		throw new Error(`Unknown variant ${variant}`);
	}
	const resolvedSnapshotDir = resolve(snapshotDir || join("config", "snapshots", snapshotId));

	if (!existsSync(resolvedSnapshotDir)) {
		throw new Error(`Snapshot directory not found: ${resolvedSnapshotDir}`);
	}

	const runtimeConfigDir = join(outputDir, "runtime-config");
	const exportConfigDir = join(outputDir, "export-config");
	const runtimeDir = join(outputDir, "runtime");
	const volumeDir = join(resolvedSnapshotDir, "volumes");

	rmSync(outputDir, { force: true, recursive: true });
	mkdirSync(outputDir, { recursive: true });
	cpSync(join(resolvedSnapshotDir, "config"), runtimeConfigDir, { recursive: true });
	cpSync(join(resolvedSnapshotDir, "config"), exportConfigDir, { recursive: true });
	cpSync(join(resolvedSnapshotDir, "anvil-state"), join(runtimeDir, "anvil-state"), {
		recursive: true,
	});

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
		["/config/", containerConfigRoot],
	]);
	rewriteTree(exportConfigDir, [
		["http://host.docker.internal:8545", "http://127.0.0.1:8545"],
		["http://host.docker.internal:8547", "http://127.0.0.1:8547"],
		["http://sequencer:8547", "http://127.0.0.1:8547"],
		["http://l3node:8547", "http://127.0.0.1:3347"],
		["http://127.0.0.1:8549", "http://127.0.0.1:3347"],
	]);

	const metadata = {
		l3Enabled: definition.l3Enabled,
		nitroContractsVersion,
		snapshotId,
		testnodeName,
		variant,
	};
	writeFileSync(join(outputDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

	return metadata;
}

function main() {
	const variant = readArg("--variant");
	const snapshotId = readArg("--snapshot-id");
	prepareTestnodeContext({
		containerConfigRoot: "/opt/arbitrum-testnode/runtime-config/",
		nitroContractsVersion: readArg("--nitro-contracts-version") || "",
		outputDir: resolve(readArg("--output-dir") || ".testnode-context"),
		snapshotDir: readArg("--snapshot-dir") || "",
		snapshotId,
		testnodeName: readArg("--testnode-name") || "",
		variant,
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
