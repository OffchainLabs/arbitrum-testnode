/**
 * Deterministic test accounts derived from the standard Hardhat mnemonic.
 * These are well-known, publicly documented keys -- never use them on mainnet.
 */

export const MNEMONIC = "test test test test test test test test test test test junk";

export interface Account {
	/** Human-readable role name */
	name: string;
	/** Checksummed Ethereum address */
	address: `0x${string}`;
	/** Hex-encoded private key (with 0x prefix) */
	privateKey: `0x${string}`;
	/** HD wallet derivation index (m/44'/60'/0'/0/{index}) */
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
	deployer: defineAccount(
		"deployer",
		0,
		"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
	),
	l2Sequencer: defineAccount(
		"l2Sequencer",
		1,
		"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
	),
	l2Validator: defineAccount(
		"l2Validator",
		2,
		"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
		"0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
	),
	l2BatchPoster: defineAccount(
		"l2BatchPoster",
		3,
		"0x90F79bf6EB2c4f870365E785982E1f101E93b906",
		"0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
	),
	l3Sequencer: defineAccount(
		"l3Sequencer",
		4,
		"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
		"0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
	),
	l3Validator: defineAccount(
		"l3Validator",
		5,
		"0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
		"0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
	),
	l3BatchPoster: defineAccount(
		"l3BatchPoster",
		6,
		"0x976EA74026E726554dB657fA54763abd0C3a0aa9",
		"0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
	),
	fundsProvider: defineAccount(
		"fundsProvider",
		7,
		"0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
		"0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
	),
} as const;

/** Returns all accounts as an array, sorted by HD wallet index. */
export function allAccounts(): Account[] {
	return Object.values(accounts).sort((a, b) => a.index - b.index);
}
