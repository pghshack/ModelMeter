"""Vercel serverless handler for /api/models and /api/health."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from http.server import BaseHTTPRequestHandler

from _lib import build_response, init_secrets

init_secrets()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/health"):
            body = json.dumps({"status": "ok"}).encode()
        elif self.path.startswith("/api/models"):
            try:
                body = json.dumps(build_response()).encode()
            except Exception as exc:
                body = json.dumps({"error": str(exc)}).encode()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.end_headers()
                self.wfile.write(body)
                return
        else:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def log_message(self, format, *args):  # noqa: A002
        pass
