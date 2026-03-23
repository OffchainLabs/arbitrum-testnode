#!/usr/bin/env python3
"""HTTP server for the CI runtime container.

Serves two concerns on port 8080:
  GET /health         — JSON health check (polls all RPC endpoints)
  GET /config/<path>  — static files from export-config/
  GET /               — lists available routes
"""

import http.server
import json
import os
import sys
import urllib.request
from pathlib import Path

EXPORT_CONFIG_DIR = Path("/opt/arbitrum-testnode/export-config")
VARIANT = os.environ.get("TESTNODE_VARIANT", "l2")
RPC_BODY = json.dumps({"id": 1, "jsonrpc": "2.0", "method": "eth_chainId", "params": []}).encode()

ENDPOINTS = {
    "l1": "http://127.0.0.1:8545",
    "l2": "http://127.0.0.1:8547",
}
if VARIANT != "l2":
    ENDPOINTS["l3"] = "http://127.0.0.1:8549"


def check_rpc(url):
    try:
        req = urllib.request.Request(
            url,
            data=RPC_BODY,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            body = json.loads(resp.read())
            return {"ok": True, "chainId": body.get("result")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(EXPORT_CONFIG_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/health":
            self._handle_health()
        elif self.path == "/":
            self._handle_index()
        elif self.path.startswith("/config/"):
            self.path = self.path[len("/config"):]
            super().do_GET()
        else:
            # Serve files directly too (backwards compat with /localNetwork.json)
            super().do_GET()

    def _handle_health(self):
        results = {name: check_rpc(url) for name, url in ENDPOINTS.items()}
        healthy = all(r["ok"] for r in results.values())
        status = 200 if healthy else 503
        body = json.dumps({"healthy": healthy, "variant": VARIANT, "endpoints": results}, indent=2)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode())

    def _handle_index(self):
        config_files = []
        if EXPORT_CONFIG_DIR.exists():
            for p in sorted(EXPORT_CONFIG_DIR.rglob("*")):
                if p.is_file():
                    rel = p.relative_to(EXPORT_CONFIG_DIR)
                    config_files.append(f"/config/{rel}")
        body = json.dumps({
            "routes": {
                "/health": "Health check — returns 200 when all RPCs are responding, 503 otherwise",
                "/config/<path>": "Config files (contract addresses, network info)",
            },
            "config_files": config_files,
            "variant": VARIANT,
        }, indent=2)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format, *args):
        # Suppress per-request logs to avoid noise in container output
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.HTTPServer(("0.0.0.0", port), Handler)
    print(f"config server listening on 0.0.0.0:{port}")
    server.serve_forever()
