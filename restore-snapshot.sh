#!/bin/bash
set -e
cd /Users/douglance/Developer/oc/arbitrum-testnode

# Remove existing volumes
docker volume rm -f arbitrum-testnode_sequencer-data 2>/dev/null || true
docker volume rm -f arbitrum-testnode_validator-data 2>/dev/null || true
docker volume rm -f arbitrum-testnode_l3node-data 2>/dev/null || true

# Import volumes from snapshot
for vol in sequencer-data validator-data l3node-data; do
  docker volume create "arbitrum-testnode_${vol}"
  docker run --rm \
    -v "arbitrum-testnode_${vol}:/to" \
    -v "$(pwd)/config/snapshots/default/volumes:/from" \
    alpine sh -c "cd /to && tar -xf /from/${vol}.tar"
  echo "Imported ${vol}"
done

# Restore config files
npx tsx src/index.ts snapshot restore 2>&1 || true

# Start anvil with state
echo "Starting Anvil..."
anvil --host 0.0.0.0 --port 8545 --load-state config/anvil-state --block-time 1 --accounts 0 &
ANVIL_PID=$!
echo "Anvil PID: $ANVIL_PID"

sleep 3

# Start docker services
docker compose -f docker/docker-compose.yaml -p arbitrum-testnode up -d sequencer validator l3node

echo "Waiting for L2..."
until curl -s -m 1 http://127.0.0.1:8547 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' >/dev/null 2>&1; do
  sleep 1
done

echo "TESTNODE READY"
