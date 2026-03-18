# Arbitrum Testnode

A snapshot-backed Arbitrum testnode that boots L1 + L2 + L3 with token bridges in seconds. Ships as both a local development CLI and a GitHub Action for CI.

## Quick Start

### GitHub Action

```yaml
- uses: OffchainLabs/arbitrum-testnode@v0.1.0
  with:
    version: v0.1.0
    l3-node: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

The action starts a fully initialized testnode and exports environment variables for RPC URLs and contract addresses:

| Variable | Description |
|----------|-------------|
| `ARBITRUM_TESTNODE_L1_RPC_URL` | L1 (Anvil) RPC endpoint |
| `ARBITRUM_TESTNODE_L2_RPC_URL` | L2 (Nitro) RPC endpoint |
| `ARBITRUM_TESTNODE_L3_RPC_URL` | L3 (Orbit) RPC endpoint |
| `ARBITRUM_TESTNODE_LOCAL_NETWORK_PATH` | Path to `localNetwork.json` with all deployed contract addresses |
| `ARBITRUM_TESTNODE_CONFIG_DIR` | Directory with all exported config files |

### Local Development

```bash
pnpm install
pnpm dev init           # First run: deploys everything from scratch (~12 min)
pnpm dev init           # Subsequent runs: restores from snapshot (~10 sec)
pnpm dev stop           # Stop all services
pnpm dev start          # Restart from saved state
pnpm dev clean          # Remove containers and runtime data
pnpm dev status         # Show service and init state
```

## Architecture

```
src/
├── index.ts              # CLI entry point
├── accounts.ts           # Deterministic HD wallet accounts (official nitro-testnode mnemonic)
├── rpc.ts                # Viem client factories and contract ABIs
├── state.ts              # Init state persistence (JSON)
├── exec.ts               # Shell helpers for external CLIs
├── docker.ts             # Docker Compose helpers + RPC polling
├── snapshot.ts           # Snapshot capture, restore, and verification
├── token-bridge.ts       # Token bridge deployment (L1-L2 and L2-L3)
├── validator-wallet.ts   # Validator wallet creation and staking
└── commands/
    ├── init.ts           # 14-step init sequence with resume
    ├── start.ts          # Start all Docker services
    ├── stop.ts           # Stop all Docker services
    ├── clean.ts          # Remove containers, volumes, config
    └── status.ts         # Show service and init state
```

## Init Sequence

The `init` command runs 14 steps to deploy a complete L1 + L2 + L3 stack:

| # | Step | Description |
|---|------|-------------|
| 1 | `start-l1` | Start Anvil (L1) with the official testnode mnemonic |
| 2 | `wait-l1` | Wait for L1 RPC readiness |
| 3 | `deploy-l2-rollup` | Deploy L2 rollup contracts on L1 via RollupCreator |
| 4 | `generate-l2-config` | Generate Nitro node config for L2 |
| 5 | `start-l2` | Start L2 sequencer and validator (Docker) |
| 6 | `wait-l2` | Wait for L2 RPC readiness |
| 7 | `deposit-eth-to-l2` | Bridge ETH from L1 to L2 via inbox |
| 8 | `deploy-l2-token-bridge` | Deploy L1-L2 token bridge contracts |
| 9 | `deploy-l3-rollup` | Deploy L3 rollup contracts on L2 |
| 10 | `generate-l3-config` | Generate Nitro node config for L3 |
| 11 | `start-l3` | Start L3 node (Docker) |
| 12 | `wait-l3` | Wait for L3 RPC readiness |
| 13 | `deposit-eth-to-l3` | Bridge ETH from L2 to L3 via inbox |
| 14 | `deploy-l3-token-bridge` | Deploy L2-L3 token bridge contracts |

State is persisted to `config/state.json` after each step, enabling automatic resume on failure.

## Chain Configuration

| Property | L1 | L2 | L3 |
|----------|----|----|-----|
| Chain ID | 1337 | 412346 | 333333 |
| Chain Name | — | arb-dev-test | orbit-dev-test |
| RPC Port | 8545 | 8547 | 8549 |
| Runtime | Anvil | Nitro (Docker) | Nitro (Docker) |

## Accounts

Derived from the official nitro-testnode mnemonic. All accounts are pre-funded on L1.

| Index | Role | Address |
|-------|------|---------|
| 0 | `funnel` (funder) | `0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E` |
| 1 | `sequencer` (L2) | `0xe2148eE53c0755215Df69b2616E552154EdC584f` |
| 2 | `validator` (L2) | `0x6A568afe0f82d34759347bb36F14A6bB171d2CBe` |
| 3 | `l3owner` | `0x863c904166E801527125D8672442D736194A3362` |
| 4 | `l3sequencer` | `0x3E6134aAD4C4d422FF2A4391Dc315c4DDf98D1a5` |
| 5 | `l2owner` | `0x5E1497dD1f08C87b2d8FE23e9AAB6c1De833D927` |

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `version` | Yes | — | Release version for the runtime image tag |
| `l3-node` | No | `false` | Boot the L3 node |
| `github-token` | No | — | Token for GHCR authentication |
| `image-repository` | No | `ghcr.io/offchainlabs/arbitrum-testnode-ci` | Container image repository |
| `fee-token-decimals` | No | — | Custom fee token decimals (16, 18, or 20) |
| `startup-timeout-seconds` | No | `120` | Max wait time for RPC readiness |

## Development

```bash
pnpm install              # Install dependencies
pnpm dev                  # Run CLI in dev mode (tsx)
pnpm build                # Bundle to dist/index.mjs
pnpm test:run             # Run tests once
pnpm lint                 # Lint check (Biome)
pnpm lint:fix             # Auto-fix lint issues
pnpm typecheck            # Type check
pnpm validate             # Full validation (lint + build + typecheck + test)
```

## External Dependencies

- [Anvil](https://book.getfoundry.sh/anvil/) (Foundry) for L1
- [Nitro](https://github.com/OffchainLabs/nitro) node Docker images for L2/L3
- `arbitrum` CLI for rollup deployment and config generation
- Docker for running Nitro nodes

## License

Apache-2.0
