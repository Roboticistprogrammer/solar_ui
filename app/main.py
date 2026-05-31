from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.simulator import build_snapshot

ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"


class DashboardHandler(SimpleHTTPRequestHandler):
    """Small standard-library HTTP handler for the prototype dashboard."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method naming
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"status": "ok", "service": "solar-ui"})
            return
        if parsed.path == "/api/telemetry":
            query = parse_qs(parsed.query)
            elapsed = int(query.get("elapsed_seconds", ["1104"])[0])
            self._send_json(build_snapshot(elapsed_seconds=elapsed).to_dict())
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def _send_json(self, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), DashboardHandler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the solar washer drone dashboard prototype.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = create_server(args.host, args.port)
    print(f"Dashboard running at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
