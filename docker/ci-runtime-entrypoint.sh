#!/bin/sh
set -eu

CONFIG_ROOT="/opt/arbitrum-testnode/runtime-config"
DATA_ROOT="/opt/arbitrum-testnode/runtime"
VARIANT="${TESTNODE_VARIANT:-l2}"
NITRO_WASM_ROOTS="/home/user/nitro-legacy/machines,/home/user/target/machines"
PIDS=""

start_background() {
	"$@" &
	PIDS="$PIDS $!"
}

cleanup() {
	for pid in $PIDS; do
		kill "$pid" 2>/dev/null || true
	done
	wait || true
}

monitor_pids() {
	while true; do
		for pid in $PIDS; do
			if ! kill -0 "$pid" 2>/dev/null; then
				wait "$pid" || true
				exit 1
			fi
		done
		sleep 1
	done
}

trap cleanup EXIT INT TERM

echo "state file: $DATA_ROOT/anvil-state"
ls -la "$DATA_ROOT/anvil-state" 2>&1 || echo "state file missing!"
echo "variant: $VARIANT"

start_background /usr/local/bin/anvil \
	--host 0.0.0.0 \
	--port 8545 \
	--block-time 1 \
	--chain-id 1337 \
	--mnemonic "indoor dish desk flag debris potato excuse depart ticket judge file exit" \
	--load-state "$DATA_ROOT/anvil-state"

echo "waiting for anvil on port 8545..."
DEADLINE=$(($(date +%s) + 60))
while ! grep -q ":2161 " /proc/net/tcp 2>/dev/null; do
	if [ "$(date +%s)" -ge "$DEADLINE" ]; then
		echo "anvil did not start within 60s" >&2
		exit 1
	fi
	sleep 1
done
echo "anvil ready"

start_background env HOME="$DATA_ROOT/sequencer" /usr/local/bin/nitro \
	--validation.wasm.allowed-wasm-module-roots "$NITRO_WASM_ROOTS" \
	--conf.file="$CONFIG_ROOT/l2-nodeConfig.json" \
	--node.feed.output.enable \
	--node.feed.output.port=9642 \
	--node.dangerous.disable-blob-reader \
	--node.staker.enable=false \
	--http.addr=0.0.0.0 \
	--http.port=8547 \
	--http.api=net,web3,eth,txpool,debug \
	--http.corsdomain='*' \
	--http.vhosts='*' \
	--ws.addr=0.0.0.0 \
	--ws.port=8548 \
	--auth.port=8551

start_background env HOME="$DATA_ROOT/validator" /usr/local/bin/nitro \
	--validation.wasm.allowed-wasm-module-roots "$NITRO_WASM_ROOTS" \
	--conf.file="$CONFIG_ROOT/l2-nodeConfig.json" \
	--node.sequencer=false \
	--node.delayed-sequencer.enable=false \
	--node.dangerous.disable-blob-reader \
	--execution.sequencer.enable=false \
	--execution.forwarding-target=null \
	--node.staker.enable=true \
	--node.staker.use-smart-contract-wallet=true \
	--node.staker.disable-challenge=true \
	--node.staker.dangerous.without-block-validator \
	--node.staker.staker-interval=100ms \
	--node.staker.make-assertion-interval=100ms \
	--node.staker.confirmation-blocks=1 \
	--node.bold.check-staker-switch-interval=876000h \
	--node.bold.rpc-block-number=latest \
	--node.bold.assertion-posting-interval=100ms \
	--node.bold.assertion-confirming-interval=100ms \
	--node.bold.assertion-scanning-interval=100ms \
	--node.bold.minimum-gap-to-parent-assertion=100ms \
	--node.bold.parent-chain-block-time=100ms \
	--http.addr=0.0.0.0 \
	--http.port=8647 \
	--http.api=net,web3,eth \
	--ws.addr=0.0.0.0 \
	--ws.port=8648 \
	--auth.port=8552

if [ "$VARIANT" != "l2" ]; then
	echo "waiting 10s for L2 sequencer to start..."
	sleep 10
	echo "L2 wait done, starting L3 node"

	start_background env HOME="$DATA_ROOT/l3node" /usr/local/bin/nitro \
		--validation.wasm.allowed-wasm-module-roots "$NITRO_WASM_ROOTS" \
		--conf.file="$CONFIG_ROOT/l3-nodeConfig.json" \
		--node.dangerous.disable-blob-reader \
		--http.addr=0.0.0.0 \
		--http.port=8549 \
		--http.api=net,web3,eth,txpool,debug \
		--http.corsdomain='*' \
		--http.vhosts='*' \
		--ws.addr=0.0.0.0 \
		--ws.port=8550 \
		--auth.port=8553

	# Wait for L3 RPC to be ready, then fund test accounts
	echo "waiting for L3 RPC on port 8549..."
	L3_DEADLINE=$(($(date +%s) + 120))
	while ! cast chain-id --rpc-url http://127.0.0.1:8549 >/dev/null 2>&1; do
		if [ "$(date +%s)" -ge "$L3_DEADLINE" ]; then
			echo "L3 RPC did not start within 120s" >&2
			break
		fi
		# Nudge L2 to produce blocks so L3 can sync
		cast send --private-key 0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659 \
			--rpc-url http://127.0.0.1:8547 --value 0 \
			0x0000000000000000000000000000000000000000 >/dev/null 2>&1 || true
		sleep 2
	done

	# Fund userFeeTokenDeployer on L3 (portal E2E tests use it as funder for custom fee token tests)
	echo "funding userFeeTokenDeployer on L3..."
	cast send --private-key 0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659 \
		--rpc-url http://127.0.0.1:8549 --value 10ether \
		0x9205AE47eC1982d06a4C57753060B763850b3Cd3 >/dev/null 2>&1 && \
		echo "userFeeTokenDeployer funded on L3" || \
		echo "warning: failed to fund userFeeTokenDeployer on L3"
fi

# Legacy compat: make network files accessible at /tokenbridge-data/ for SDK's gen:network
mkdir -p /tokenbridge-data
ln -sf /opt/arbitrum-testnode/export-config/l1l2_network.json /tokenbridge-data/l1l2_network.json
ln -sf /opt/arbitrum-testnode/export-config/l2l3_network.json /tokenbridge-data/l2l3_network.json

monitor_pids
