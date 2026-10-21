#!/usr/bin/env python3
"""Serveur de développement : comme `python3 -m http.server`, mais sans cache navigateur,
pour que chaque rechargement affiche la dernière version des fichiers.

Usage : python3 serve.py [port]   (8000 par défaut)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Resize Studio : http://localhost:{port}')
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
