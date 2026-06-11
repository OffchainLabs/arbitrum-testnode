#!/bin/sh
set -eu

CONFIG_ROOT="${TESTNODE_CONFIG_ROOT:-/config}"
SEQUENCER_HTTP_API="${SEQUENCER_HTTP_API:-net,web3,eth,txpool,debug}"

if [ -f "$CONFIG_ROOT/timeboost-auction.json" ]; then
	auction_contract_address="$(jq -r '.auctionContract // empty' "$CONFIG_ROOT/timeboost-auction.json")"
	if [ -n "$auction_contract_address" ]; then
		: "${TESTNODE_TIMEBOOST_REDIS_URL:?TESTNODE_TIMEBOOST_REDIS_URL is required when timeboost-auction.json is present}"
		SEQUENCER_HTTP_API="$SEQUENCER_HTTP_API,timeboost,auctioneer"
		set -- "$@" \
			--execution.sequencer.timeboost.enable \
			--execution.sequencer.timeboost.redis-url="$TESTNODE_TIMEBOOST_REDIS_URL" \
			--execution.sequencer.timeboost.auction-contract-address="$auction_contract_address" \
			--execution.sequencer.timeboost.auctioneer-address=0x46225F4cee2b4A1d506C7f894bb3dAeB21BF1596
		echo "timeboost: enabled with auction $auction_contract_address"
	fi
fi

exec nitro --http.api="$SEQUENCER_HTTP_API" "$@"
