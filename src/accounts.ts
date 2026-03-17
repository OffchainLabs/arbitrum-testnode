/**
 * Deterministic test accounts derived from the official nitro-testnode mnemonic.
 * These are well-known, publicly documented keys -- never use them on mainnet.
 */

export const MNEMONIC = "indoor dish desk flag debris potato excuse depart ticket judge file exit";

export interface Account {
	/** Human-readable role name */
	name: string;
	/** Checksummed Ethereum address */
	address: `0x${string}`;
	/** Hex-encoded private key (with 0x prefix) */
	privateKey: `0x${string}`;
	/** HD wallet derivation index (m/44'/60'/0'/0/{index}), or -1 for non-HD accounts */
	index: number;
}

function defineAccount(
	name: string,
	index: number,
	address: `0x${string}`,
	privateKey: `0x${string}`,
): Account {
	return { name, address, privateKey, index };
}

export const accounts = {
	funnel: defineAccount(
		"funnel",
		0,
		"0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E",
		"0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659",
	),
	sequencer: defineAccount(
		"sequencer",
		1,
		"0xe2148eE53c0755215Df69b2616E552154EdC584f",
		"0xcb5790da63720727af975f42c79f69918580209889225fa7128c92402a6d3a65",
	),
	validator: defineAccount(
		"validator",
		2,
		"0x6A568afe0f82d34759347bb36F14A6bB171d2CBe",
		"0x182fecf15bdf909556a0f617a63e05ab22f1493d25a9f1e27c228266c772a890",
	),
	l3owner: defineAccount(
		"l3owner",
		3,
		"0x863c904166E801527125D8672442D736194A3362",
		"0xecdf21cb41c65afb51f91df408b7656e2c8739a5877f2814add0afd780cc210e",
	),
	l3sequencer: defineAccount(
		"l3sequencer",
		4,
		"0x3E6134aAD4C4d422FF2A4391Dc315c4DDf98D1a5",
		"0x90f899754eb42949567d3576224bf533a20857bf0a60318507b75fcb3edc6f5f",
	),
	l2owner: defineAccount(
		"l2owner",
		5,
		"0x5E1497dD1f08C87b2d8FE23e9AAB6c1De833D927",
		"0xdc04c5399f82306ec4b4d654a342f40e2e0620fe39950d967e1e574b32d4dd36",
	),
	auctioneer: defineAccount(
		"auctioneer",
		6,
		"0x46225F4cee2b4A1d506C7f894bb3dAeB21BF1596",
		"0xb0c3d5fa3891e7029918fdf0ed5448e0d6b7642c4ee2c8fa921bc703b4bc7c9f",
	),
	filterer: defineAccount(
		"filterer",
		7,
		"0x19ED240ddd4DDEeDdF2B77aA279F258eFC52f9b7",
		"0x19b611a70d1cbed3eb0678f3fc1fa78141d3a7c7b3a18242043d30c35e768b9d",
	),
	userTokenBridgeDeployer: defineAccount(
		"userTokenBridgeDeployer",
		-1,
		"0x3EaCb30f025630857aDffac9B2366F953eFE4F98",
		"0xadd3d9301e184194943ce6244aa25c90e73c5843db16a994d202091f97f5bb27",
	),
	userFeeTokenDeployer: defineAccount(
		"userFeeTokenDeployer",
		-1,
		"0x9205AE47eC1982d06a4C57753060B763850b3Cd3",
		"0x84f89f9afcf4cd87bbf0a8872a1abd8ddf69364da61a2c2a5286d999383cd2c9",
	),
} as const;

/** Returns all HD accounts as an array, sorted by HD wallet index. Non-HD accounts (index -1) are excluded. */
export function allAccounts(): Account[] {
	return Object.values(accounts)
		.filter((a) => a.index >= 0)
		.sort((a, b) => a.index - b.index);
}
