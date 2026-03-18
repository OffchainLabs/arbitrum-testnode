import {
	http,
	type Address,
	type PublicClient,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

export function publicClient(rpcUrl: string): PublicClient {
	return createPublicClient({ chain: foundry, transport: http(rpcUrl) });
}

export function walletClient(rpcUrl: string, privateKey: `0x${string}`): WalletClient {
	return createWalletClient({
		account: privateKeyToAccount(privateKey),
		chain: foundry,
		transport: http(rpcUrl),
	});
}

export const erc20Abi = parseAbi([
	"function balanceOf(address) view returns (uint256)",
	"function transfer(address, uint256) returns (bool)",
	"function approve(address, uint256) returns (bool)",
	"function deposit() payable",
]);

export const inboxAbi = parseAbi(["function depositEth() payable"]);

export const rollupAbi = parseAbi([
	"function baseStake() view returns (uint256)",
	"function amountStaked(address) view returns (uint256)",
	"function getStaker(address) view returns (uint256, bytes32, uint64, bool, address)",
	"function outbox() view returns (address)",
	"function rollupEventInbox() view returns (address)",
	"function challengeManager() view returns (address)",
]);

export const arbOwnerAbi = parseAbi([
	"function addChainOwner(address)",
	"function removeChainOwner(address)",
]);

export const validatorWalletCreatorAbi = parseAbi([
	"function createWallet(address[]) returns (address)",
	"event WalletCreated(address indexed walletAddress, address indexed executorAddress, address indexed ownerAddress, address adminProxy)",
]);

export const validatorWalletAbi = parseAbi([
	"function executeTransactions(bytes[], address[], uint256[])",
]);

export const gatewayRouterAbi = parseAbi(["function getGateway(address) view returns (address)"]);

export async function getBalanceWei(address: Address, rpcUrl: string): Promise<bigint> {
	return publicClient(rpcUrl).getBalance({ address });
}

export async function readContractOrZero(
	contractAddress: Address,
	abi: readonly unknown[],
	functionName: string,
	rpcUrl: string,
	args?: readonly unknown[],
): Promise<Address> {
	try {
		return (await publicClient(rpcUrl).readContract({
			address: contractAddress,
			abi,
			functionName,
			args,
		})) as Address;
	} catch {
		return "0x0000000000000000000000000000000000000000";
	}
}
