#!/usr/bin/env python3
"""Local HTTPS server for WebXR testing on Meta Quest 2 / 3.

Serves static files over TLS on 0.0.0.0 with no-store headers.
"""
from __future__ import annotations

import http.server
import os
import socketserver
import ssl
import sys
from pathlib import Path
from typing import Any


class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.address_string()} - {format % args}\n")


def run_https_server(port: int = 8443, root_dir: str | Path | None = None) -> None:
    if root_dir:
        os.chdir(root_dir)

    cert_path = Path(__file__).parent / "cert.pem"
    key_path = Path(__file__).parent / "key.pem"

    if not cert_path.exists() or not key_path.exists():
        raise FileNotFoundError(f"SSL certificate or key missing: {cert_path}, {key_path}")

    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))

    socketserver.TCPServer.allow_reuse_address = True
    server_address: tuple[str, int] = ("0.0.0.0", port)

    with socketserver.ThreadingTCPServer(server_address, NoCacheHTTPRequestHandler) as httpd:
        httpd.socket = ssl_context.wrap_socket(httpd.socket, server_side=True)
        print(f"Serving HTTPS on https://0.0.0.0:{port} (local: https://192.168.1.186:{port})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    port_arg: int = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
    run_https_server(port=port_arg, root_dir=Path(__file__).parent.parent)
