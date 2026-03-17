import { describe, expect, it } from "vitest";
import { type Account, MNEMONIC, accounts, allAccounts } from "../src/accounts.js";

describe("accounts", () => {
	describe("MNEMONIC", () => {
		it("is the official nitro-testnode mnemonic", () => {
			expect(MNEMONIC).toBe(
				"indoor dish desk flag debris potato excuse depart ticket judge file exit",
			);
		});
	});

	describe("funnel (index 0)", () => {
		it("has the correct address", () => {
			expect(accounts.funnel.address).toBe("0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E");
		});

		it("has the correct private key", () => {
			expect(accounts.funnel.privateKey).toBe(
				"0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659",
			);
		});

		it("has index 0", () => {
			expect(accounts.funnel.index).toBe(0);
		});

		it("has the correct name", () => {
			expect(accounts.funnel.name).toBe("funnel");
		});
	});

	describe("sequencer (index 1)", () => {
		it("has the correct address", () => {
			expect(accounts.sequencer.address).toBe(
				"0xe2148eE53c0755215Df69b2616E552154EdC584f",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.sequencer.privateKey).toBe(
				"0xcb5790da63720727af975f42c79f69918580209889225fa7128c92402a6d3a65",
			);
		});

		it("has index 1", () => {
			expect(accounts.sequencer.index).toBe(1);
		});

		it("has the correct name", () => {
			expect(accounts.sequencer.name).toBe("sequencer");
		});
	});

	describe("validator (index 2)", () => {
		it("has the correct address", () => {
			expect(accounts.validator.address).toBe(
				"0x6A568afe0f82d34759347bb36F14A6bB171d2CBe",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.validator.privateKey).toBe(
				"0x182fecf15bdf909556a0f617a63e05ab22f1493d25a9f1e27c228266c772a890",
			);
		});

		it("has index 2", () => {
			expect(accounts.validator.index).toBe(2);
		});

		it("has the correct name", () => {
			expect(accounts.validator.name).toBe("validator");
		});
	});

	describe("l3owner (index 3)", () => {
		it("has the correct address", () => {
			expect(accounts.l3owner.address).toBe("0x863c904166E801527125D8672442D736194A3362");
		});

		it("has the correct private key", () => {
			expect(accounts.l3owner.privateKey).toBe(
				"0xecdf21cb41c65afb51f91df408b7656e2c8739a5877f2814add0afd780cc210e",
			);
		});

		it("has index 3", () => {
			expect(accounts.l3owner.index).toBe(3);
		});

		it("has the correct name", () => {
			expect(accounts.l3owner.name).toBe("l3owner");
		});
	});

	describe("l3sequencer (index 4)", () => {
		it("has the correct address", () => {
			expect(accounts.l3sequencer.address).toBe(
				"0x3E6134aAD4C4d422FF2A4391Dc315c4DDf98D1a5",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.l3sequencer.privateKey).toBe(
				"0x90f899754eb42949567d3576224bf533a20857bf0a60318507b75fcb3edc6f5f",
			);
		});

		it("has index 4", () => {
			expect(accounts.l3sequencer.index).toBe(4);
		});

		it("has the correct name", () => {
			expect(accounts.l3sequencer.name).toBe("l3sequencer");
		});
	});

	describe("l2owner (index 5)", () => {
		it("has the correct address", () => {
			expect(accounts.l2owner.address).toBe("0x5E1497dD1f08C87b2d8FE23e9AAB6c1De833D927");
		});

		it("has the correct private key", () => {
			expect(accounts.l2owner.privateKey).toBe(
				"0xdc04c5399f82306ec4b4d654a342f40e2e0620fe39950d967e1e574b32d4dd36",
			);
		});

		it("has index 5", () => {
			expect(accounts.l2owner.index).toBe(5);
		});

		it("has the correct name", () => {
			expect(accounts.l2owner.name).toBe("l2owner");
		});
	});

	describe("auctioneer (index 6)", () => {
		it("has the correct address", () => {
			expect(accounts.auctioneer.address).toBe(
				"0x46225F4cee2b4A1d506C7f894bb3dAeB21BF1596",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.auctioneer.privateKey).toBe(
				"0xb0c3d5fa3891e7029918fdf0ed5448e0d6b7642c4ee2c8fa921bc703b4bc7c9f",
			);
		});

		it("has index 6", () => {
			expect(accounts.auctioneer.index).toBe(6);
		});

		it("has the correct name", () => {
			expect(accounts.auctioneer.name).toBe("auctioneer");
		});
	});

	describe("filterer (index 7)", () => {
		it("has the correct address", () => {
			expect(accounts.filterer.address).toBe(
				"0x19ED240ddd4DDEeDdF2B77aA279F258eFC52f9b7",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.filterer.privateKey).toBe(
				"0x19b611a70d1cbed3eb0678f3fc1fa78141d3a7c7b3a18242043d30c35e768b9d",
			);
		});

		it("has index 7", () => {
			expect(accounts.filterer.index).toBe(7);
		});

		it("has the correct name", () => {
			expect(accounts.filterer.name).toBe("filterer");
		});
	});

	describe("userTokenBridgeDeployer (non-HD)", () => {
		it("has the correct address", () => {
			expect(accounts.userTokenBridgeDeployer.address).toBe(
				"0x3EaCb30f025630857aDffac9B2366F953eFE4F98",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.userTokenBridgeDeployer.privateKey).toBe(
				"0xadd3d9301e184194943ce6244aa25c90e73c5843db16a994d202091f97f5bb27",
			);
		});

		it("has index -1", () => {
			expect(accounts.userTokenBridgeDeployer.index).toBe(-1);
		});

		it("has the correct name", () => {
			expect(accounts.userTokenBridgeDeployer.name).toBe("userTokenBridgeDeployer");
		});
	});

	describe("userFeeTokenDeployer (non-HD)", () => {
		it("has the correct address", () => {
			expect(accounts.userFeeTokenDeployer.address).toBe(
				"0x9205AE47eC1982d06a4C57753060B763850b3Cd3",
			);
		});

		it("has the correct private key", () => {
			expect(accounts.userFeeTokenDeployer.privateKey).toBe(
				"0x84f89f9afcf4cd87bbf0a8872a1abd8ddf69364da61a2c2a5286d999383cd2c9",
			);
		});

		it("has index -1", () => {
			expect(accounts.userFeeTokenDeployer.index).toBe(-1);
		});

		it("has the correct name", () => {
			expect(accounts.userFeeTokenDeployer.name).toBe("userFeeTokenDeployer");
		});
	});

	describe("allAccounts()", () => {
		it("returns all 8 HD accounts (excludes non-HD accounts)", () => {
			const all = allAccounts();
			expect(all).toHaveLength(8);
		});

		it("returns accounts in index order", () => {
			const all = allAccounts();
			for (let i = 0; i < all.length; i++) {
				expect(all[i]?.index).toBe(i);
			}
		});

		it("includes every HD account by name", () => {
			const all = allAccounts();
			const names = all.map((a) => a.name);
			expect(names).toEqual([
				"funnel",
				"sequencer",
				"validator",
				"l3owner",
				"l3sequencer",
				"l2owner",
				"auctioneer",
				"filterer",
			]);
		});

		it("excludes non-HD accounts", () => {
			const all = allAccounts();
			const names = all.map((a) => a.name);
			expect(names).not.toContain("userTokenBridgeDeployer");
			expect(names).not.toContain("userFeeTokenDeployer");
		});
	});

	describe("Account type", () => {
		it("satisfies the Account interface", () => {
			const account: Account = accounts.funnel;
			expect(account.name).toBeDefined();
			expect(account.address).toBeDefined();
			expect(account.privateKey).toBeDefined();
			expect(typeof account.index).toBe("number");
		});
	});
});
