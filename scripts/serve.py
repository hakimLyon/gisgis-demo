#!/usr/bin/env python3
"""Sert la démo en local, sans cache, pour voir tout de suite chaque modification.

Usage : python3 scripts/serve.py [port]   puis ouvrir http://localhost:8765
"""

import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".geojson": "application/geo+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Démo disponible sur http://localhost:{port}  (Ctrl+C pour arrêter)")
        server.serve_forever()
