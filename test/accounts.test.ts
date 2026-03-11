import { describe, expect, it } from "vitest";
import { type Account, MNEMONIC, accounts, allAccounts } from "../src/accounts.js";

describe("accounts", () => {
	describe("MNEMONIC", () => {
		it("is the standard hardhat mnemonic", () => {
			expect(MNEMONIC).toBe("test test test test test test test test test test test junk");
		});
	});

	describe("deployer (index 0)", () => {
		it("has the correct address", () => {
			expect(accounts.deployer.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
		});

		it("has the correct private key", () => {
			expect(accounts.deployer.privateKey).toBe(
				"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
			);
		});

		it("has index 0", () => {
			expect(accounts.deployer.index).toBe(0);
		});

		it("has the correct name", () => {
			expect(accounts.deployer.name).toBe("deployer");
		});
	});

	describe("l2Sequencer (index 1)", () => {
		it("has the correct address", () => {
			expect(accounts.l2Sequencer.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
		});

		it("has the correct private key", () => {
			expect(accounts.l2Sequencer.privateKey).toBe(
				"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
			);
		});

		it("has index 1", () => {
			expect(accounts.l2Sequencer.index).toBe(1);
		});

		it("has the correct name", () => {
			expect(accounts.l2Sequencer.name).toBe("l2Sequencer");
		});
	});

	describe("l2Validator (index 2)", () => {
		it("has the correct address", () => {
			expect(accounts.l2Validator.address).toBe("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
		});

		it("has the correct private key", () => {
			expect(accounts.l2Validator.privateKey).toBe(
				"0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
			);
		});

		it("has index 2", () => {
			expect(accounts.l2Validator.index).toBe(2);
		});

		it("has the correct name", () => {
			expect(accounts.l2Validator.name).toBe("l2Validator");
		});
	});

	describe("l2BatchPoster (index 3)", () => {
		it("has the correct address", () => {
			expect(accounts.l2BatchPoster.address).toBe("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
		});

		it("has the correct private key", () => {
			expect(accounts.l2BatchPoster.privateKey).toBe(
				"0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
			);
		});

		it("has index 3", () => {
			expect(accounts.l2BatchPoster.index).toBe(3);
		});

		it("has the correct name", () => {
			expect(accounts.l2BatchPoster.name).toBe("l2BatchPoster");
		});
	});

	describe("l3Sequencer (index 4)", () => {
		it("has the correct address", () => {
			expect(accounts.l3Sequencer.address).toBe("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
		});

		it("has the correct private key", () => {
			expect(accounts.l3Sequencer.privateKey).toBe(
				"0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
			);
		});

		it("has index 4", () => {
			expect(accounts.l3Sequencer.index).toBe(4);
		});

		it("has the correct name", () => {
			expect(accounts.l3Sequencer.name).toBe("l3Sequencer");
		});
	});

	describe("l3Validator (index 5)", () => {
		it("has the correct address", () => {
			expect(accounts.l3Validator.address).toBe("0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc");
		});

		it("has the correct private key", () => {
			expect(accounts.l3Validator.privateKey).toBe(
				"0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
			);
		});

		it("has index 5", () => {
			expect(accounts.l3Validator.index).toBe(5);
		});

		it("has the correct name", () => {
			expect(accounts.l3Validator.name).toBe("l3Validator");
		});
	});

	describe("l3BatchPoster (index 6)", () => {
		it("has the correct address", () => {
			expect(accounts.l3BatchPoster.address).toBe("0x976EA74026E726554dB657fA54763abd0C3a0aa9");
		});

		it("has the correct private key", () => {
			expect(accounts.l3BatchPoster.privateKey).toBe(
				"0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
			);
		});

		it("has index 6", () => {
			expect(accounts.l3BatchPoster.index).toBe(6);
		});

		it("has the correct name", () => {
			expect(accounts.l3BatchPoster.name).toBe("l3BatchPoster");
		});
	});

	describe("fundsProvider (index 7)", () => {
		it("has the correct address", () => {
			expect(accounts.fundsProvider.address).toBe("0x14dC79964da2C08b23698B3D3cc7Ca32193d9955");
		});

		it("has the correct private key", () => {
			expect(accounts.fundsProvider.privateKey).toBe(
				"0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
			);
		});

		it("has index 7", () => {
			expect(accounts.fundsProvider.index).toBe(7);
		});

		it("has the correct name", () => {
			expect(accounts.fundsProvider.name).toBe("fundsProvider");
		});
	});

	describe("allAccounts()", () => {
		it("returns all 8 accounts", () => {
			const all = allAccounts();
			expect(all).toHaveLength(8);
		});

		it("returns accounts in index order", () => {
			const all = allAccounts();
			for (let i = 0; i < all.length; i++) {
				expect(all[i]?.index).toBe(i);
			}
		});

		it("includes every named account", () => {
			const all = allAccounts();
			const names = all.map((a) => a.name);
			expect(names).toEqual([
				"deployer",
				"l2Sequencer",
				"l2Validator",
				"l2BatchPoster",
				"l3Sequencer",
				"l3Validator",
				"l3BatchPoster",
				"fundsProvider",
			]);
		});
	});

	describe("Account type", () => {
		it("satisfies the Account interface", () => {
			const account: Account = accounts.deployer;
			expect(account.name).toBeDefined();
			expect(account.address).toBeDefined();
			expect(account.privateKey).toBeDefined();
			expect(typeof account.index).toBe("number");
		});
	});
});
