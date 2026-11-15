"""Dev server for dev/preview.html with caching disabled.

Run from the module root:  python dev/serve.py [port]

Also accepts POST /dev/__upload?path=<relative path> and saves the body under dev/<path>, so the
preview can exercise the module's "upload a cleaned image" code like Foundry's FilePicker would.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

DEV = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/dev/__upload":
            return self.send_error(404)
        rel = parse_qs(url.query).get("path", [""])[0]
        dest = (DEV / rel).resolve()
        if not rel or DEV not in dest.parents or ".." in Path(rel).parts:
            return self.send_error(400, "bad path")
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"success"}')


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
