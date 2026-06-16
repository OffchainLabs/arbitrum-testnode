/**
 * Deploys a ConstantExchangeRatePricer on the parent chain for use as the
 * feeTokenPricer of a custom-gas-token Rollup chain.
 *
 * The bytecode was compiled from ConstantExchangeRatePricer.sol using
 * solc 0.8.29 (forge build, no optimizer), matching the ERC20 in fee-token.ts.
 * The contract stores a constant exchange rate via constructor and exposes
 * getExchangeRate().
 */
import type { Address, Hex } from "viem";
import { parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, walletClient } from "./rpc.js";

export const feeTokenPricerAbi = parseAbi([
	"constructor(uint256)",
	"function getExchangeRate() view returns (uint256)",
]);

/**
 * Compiled creation bytecode for ConstantExchangeRatePricer.sol
 * (solc 0.8.29 via forge, no optimizer).
 *
 * Source contract:
 *   constructor(uint256 _exchangeRate) { exchangeRate = _exchangeRate; }
 *   function getExchangeRate() external view returns (uint256)
 */
// prettier-ignore
export const FEE_TOKEN_PRICER_BYTECODE =
	"0x60a0604052348015600e575f5ffd5b506040516101763803806101768339818101604052810190602e9190606d565b8060808181525050506093565b5f5ffd5b5f819050919050565b604f81603f565b81146058575f5ffd5b50565b5f815190506067816048565b92915050565b5f60208284031215607f57607e603b565b5b5f608a84828501605b565b91505092915050565b60805160ce6100a85f395f6047015260ce5ff3fe6080604052348015600e575f5ffd5b50600436106026575f3560e01c8063e6aa216c14602a575b5f5ffd5b60306044565b604051603b91906081565b60405180910390f35b5f7f0000000000000000000000000000000000000000000000000000000000000000905090565b5f819050919050565b607b81606b565b82525050565b5f60208201905060925f8301846074565b9291505056fea2646970667358221220356eed46c254abb8a2184de1e54a23c70ad61959c28c31f6f3437045708f2f8464736f6c634300081d0033" as Hex;

/**
 * Deploy a ConstantExchangeRatePricer on the given RPC.
 * Returns the deployed pricer contract address.
 */
export async function deployFeeTokenPricer({
	rpcUrl,
	deployerKey,
	exchangeRate,
}: {
	rpcUrl: string;
	deployerKey: `0x${string}`;
	exchangeRate: bigint;
}): Promise<Address> {
	const account = privateKeyToAccount(deployerKey);
	const client = walletClient(rpcUrl, deployerKey);
	const pub = publicClient(rpcUrl);

	console.log(
		`[fee-token-pricer] Deploying ConstantExchangeRatePricer (rate=${exchangeRate}) on ${rpcUrl}`,
	);
	const hash = await client.deployContract({
		abi: feeTokenPricerAbi,
		bytecode: FEE_TOKEN_PRICER_BYTECODE,
		account,
		args: [exchangeRate],
	});

	const receipt = await pub.waitForTransactionReceipt({ hash });
	if (!receipt.contractAddress) {
		throw new Error("Fee token pricer deployment failed: no contract address in receipt");
	}
	const pricerAddress = receipt.contractAddress;
	console.log(`[fee-token-pricer] deployed at ${pricerAddress}`);
	return pricerAddress;
}
