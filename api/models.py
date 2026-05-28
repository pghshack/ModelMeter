"""Vercel serverless handler for /api/models and /api/refresh."""
import json
import sys
import os
from http.server import BaseHTTPRequestHandler

# Allow importing from the api/ sibling _lib
sys.path.insert(0, os.path.dirname(__file__))
from _lib import build_response


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        try:
            data = build_response()
            self._send_json(200, data)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def do_POST(self) -> None:
        # /api/refresh — Vercel is stateless so nothing to clear, just 200
        self._send_json(200, {"status": "ok"})

    def log_message(self, fmt, *args) -> None:
        pass
