#!/bin/sh
set -e
curl -sf --max-time 3 http://127.0.0.1:8080/health > /dev/null
