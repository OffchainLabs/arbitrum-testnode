import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ChainConfigOptions {
	chainId: number;
	owner: string;
	dataAvailabilityCommittee?: boolean;
	arbosVersion?: number;
}

function buildChainConfig(opts: ChainConfigOptions): Record<string, unknown> {
	return {
		chainId: opts.chainId,
		homesteadBlock: 0,
		daoForkSupport: true,
		eip150Block: 0,
		eip150Hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		eip155Block: 0,
		eip158Block: 0,
		byzantiumBlock: 0,
		constantinopleBlock: 0,
		petersburgBlock: 0,
		istanbulBlock: 0,
		muirGlacierBlock: 0,
		berlinBlock: 0,
		londonBlock: 0,
		clique: { period: 0, epoch: 0 },
		arbitrum: {
			EnableArbOS: true,
			AllowDebugPrecompiles: true,
			DataAvailabilityCommittee: opts.dataAvailabilityCommittee ?? false,
			InitialArbOSVersion: opts.arbosVersion ?? 40,
			InitialChainOwner: opts.owner,
			GenesisBlockNum: 0,
		},
	};
}

export function writeChainConfig(
	configDir: string,
	filename: string,
	opts: ChainConfigOptions,
): void {
	const config = buildChainConfig(opts);
	writeFileSync(resolve(configDir, filename), JSON.stringify(config));
}
