type JsonObject = Record<string, unknown>;

const FAST_BATCH_POSTER_CONFIG = {
	"max-delay": "1s",
	"poll-interval": "1s",
	"error-delay": "1s",
	"wait-for-max-delay": false,
} as const;

const FAST_BOLD_CONFIG = {
	"rpc-block-number": "latest",
	"assertion-posting-interval": "1s",
	"assertion-confirming-interval": "1s",
	"assertion-scanning-interval": "1s",
	"minimum-gap-to-parent-assertion": "1s",
	"parent-chain-block-time": "1s",
} as const;

const FAST_STAKER_CONFIG = {
	"staker-interval": "1s",
	"make-assertion-interval": "1s",
} as const;

function getJsonObject(parent: JsonObject, key: string): JsonObject {
	const value = parent[key];
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Expected ${key} to be an object`);
	}
	return value as JsonObject;
}

function getOrCreateJsonObject(parent: JsonObject, key: string): JsonObject {
	const value = parent[key];
	if (value === undefined) {
		const next: JsonObject = {};
		parent[key] = next;
		return next;
	}
	return getJsonObject(parent, key);
}

function normalizePrivateKey(value: string): string {
	return value.startsWith("0x") ? value.slice(2) : value;
}

function patchChainInfoJsonStakeToken(config: JsonObject, stakeTokenAddress?: string): void {
	if (!stakeTokenAddress) {
		return;
	}
	const chain = getJsonObject(config, "chain");
	const infoJson = chain["info-json"];
	if (typeof infoJson !== "string") {
		return;
	}
	const parsed = JSON.parse(infoJson) as Array<Record<string, unknown>>;
	for (const entry of parsed) {
		const rollup = entry["rollup"];
		if (typeof rollup === "object" && rollup !== null && !Array.isArray(rollup)) {
			(rollup as Record<string, unknown>)["stake-token"] = stakeTokenAddress;
		}
	}
	chain["info-json"] = JSON.stringify(parsed);
}

export function patchGeneratedL2NodeConfig(
	config: JsonObject,
	batchPosterPrivateKey?: string,
	stakeTokenAddress?: string,
	stakerPrivateKey?: string,
): JsonObject {
	const next = structuredClone(config);
	const node = getJsonObject(next, "node");
	const batchPoster = getJsonObject(node, "batch-poster");
	const delayedSequencer = getJsonObject(node, "delayed-sequencer");
	const staker = getJsonObject(node, "staker");

	patchChainInfoJsonStakeToken(next, stakeTokenAddress);
	if (batchPosterPrivateKey) {
		batchPoster["parent-chain-wallet"] = {
			"private-key": normalizePrivateKey(batchPosterPrivateKey),
		};
	}
	if (stakerPrivateKey) {
		staker["parent-chain-wallet"] = {
			"private-key": normalizePrivateKey(stakerPrivateKey),
		};
	}
	staker["use-smart-contract-wallet"] = true;
	staker["disable-challenge"] = true;
	batchPoster["l1-block-bound"] = "ignore";
	Object.assign(batchPoster, FAST_BATCH_POSTER_CONFIG);
	batchPoster["data-poster"] = {
		"wait-for-l1-finality": false,
	};
	delayedSequencer["finalize-distance"] = 0;

	return next;
}

export function patchGeneratedL3NodeConfig(
	config: JsonObject,
	parentChainUrl: string,
	enableStaker = true,
): JsonObject {
	const next = structuredClone(config);
	const chain = getJsonObject(next, "chain");
	const parentChain = getJsonObject(next, "parent-chain");
	const parentConnection = getJsonObject(parentChain, "connection");
	const node = getJsonObject(next, "node");
	const batchPoster = getJsonObject(node, "batch-poster");
	const bold = getOrCreateJsonObject(node, "bold");
	const dangerous = getJsonObject(node, "dangerous");
	const delayedSequencer = getJsonObject(node, "delayed-sequencer");
	const staker = getOrCreateJsonObject(node, "staker");
	const execution = getJsonObject(next, "execution");

	next["ensure-rollup-deployment"] = false;
	delete chain["info-json"];
	chain["id"] = 412347;
	chain["info-files"] = ["/config/l3_chain_info.json"];
	parentConnection["url"] = parentChainUrl;
	batchPoster["redis-url"] = "";
	batchPoster["l1-block-bound"] = "ignore";
	Object.assign(batchPoster, FAST_BATCH_POSTER_CONFIG);
	batchPoster["data-poster"] = {
		"wait-for-l1-finality": false,
	};
	staker["enable"] = enableStaker;
	staker["use-smart-contract-wallet"] = true;
	staker["disable-challenge"] = true;
	Object.assign(staker, FAST_STAKER_CONFIG);
	Object.assign(bold, FAST_BOLD_CONFIG);
	dangerous["disable-blob-reader"] = true;
	delayedSequencer["finalize-distance"] = 0;
	execution["forwarding-target"] = "null";
	next["persistent"] = { chain: "local" };
	next["ws"] = { addr: "0.0.0.0" };

	return next;
}
