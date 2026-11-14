"""Dev server for dev/preview.html with caching disabled. Run from the module root: python dev/serve.py [port]"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
