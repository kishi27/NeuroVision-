"""LAN-only development preview with fresh, versioned frontend assets."""

import argparse
import hashlib
import io
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def frontend_revision(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if path.is_file() and path.suffix.lower() in {'.html', '.js', '.css'}:
            digest.update(path.relative_to(root).as_posix().encode('utf-8'))
            digest.update(b'\0')
            digest.update(path.read_bytes())
    return digest.hexdigest()[:20]


def version_url(url, revision):
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path:
        return url
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != 'v']
    query.append(('v', revision))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def version_source(source, suffix, revision):
    if suffix == '.html':
        # Only local script and stylesheet references; external fonts stay intact.
        pattern = r'(?P<prefix>\b(?:src|href)\s*=\s*)(?P<quote>[\x22\x27])(?P<url>[^\x22\x27]+)(?P=quote)'

        def html_asset(match):
            url = match.group('url')
            if Path(urlsplit(url).path).suffix.lower() not in {'.js', '.css'}:
                return match.group(0)
            return match.group('prefix') + match.group('quote') + version_url(url, revision) + match.group('quote')

        return re.sub(pattern, html_asset, source)
    if suffix == '.js':
        # A versioned entry module also needs versioned relative dependencies.
        pattern = r'(?P<prefix>\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(?P<quote>[\x22\x27])(?P<url>(?:\./|\.\./|/)[^\x22\x27]+)(?P=quote)'
        return re.sub(pattern, lambda match: match.group('prefix') + match.group('quote') + version_url(match.group('url'), revision) + match.group('quote'), source)
    return source


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        root = Path(self.directory).resolve()
        if not path.resolve().is_relative_to(root):
            self.send_error(403)
            return None
        if path.is_dir():
            path = path / 'index.html'
        suffix = path.suffix.lower()
        if path.is_file() and suffix in {'.html', '.js', '.css'}:
            try:
                revision = frontend_revision(root)
                source = path.read_bytes().decode('utf-8')
                body = version_source(source, suffix, revision).encode('utf-8')
            except (OSError, UnicodeError):
                self.send_error(500, 'Unable to read frontend asset')
                return None
            # Always return fresh content, including conditional requests.
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(path)) + '; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Frontend-Revision', revision)
            self.end_headers()
            return io.BytesIO(body)
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[1] / 'frontend')
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    root = args.directory.resolve(strict=True)
    if not (root / 'index.html').is_file():
        parser.error('frontend/index.html was not found')
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    handler = partial(PreviewHandler, directory=str(root))
    server = ThreadingHTTPServer(('0.0.0.0', args.port), handler)
    print(f'Serving {root} on 0.0.0.0:{args.port}; revision {frontend_revision(root)}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
