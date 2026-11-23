#!/usr/bin/env python3
"""Validate local portfolio links, strict JSON, frozen data, and project tests.

No network requests and no data refreshes are performed. Run from any directory.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache'}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        for name in ('href', 'src', 'poster'):
            if attrs.get(name):
                self.targets.append(attrs[name])


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f'duplicate JSON key: {key}')
            result[key] = value
        return result

    def constant(value):
        raise ValueError(f'non-standard JSON number: {value}')

    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def files():
    result = subprocess.run(
        ['git', 'ls-files', '-co', '--exclude-standard', '-z'],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode == 0:
        return sorted({ROOT / name for name in result.stdout.split('\0') if name})
    return sorted(p for p in ROOT.rglob('*') if p.is_file()
                  and not any(part in SKIP_PARTS for part in p.relative_to(ROOT).parts))


def local_target(source, href):
    parsed = urlsplit(href)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    path = unquote(parsed.path)
    if path.startswith('/'):
        raise ValueError(f'root-relative URL breaks project-site hosting: {href}')
    target = (source.parent / path).resolve()
    if not target.is_relative_to(ROOT):
        raise ValueError(f'local link leaves the repository: {href}')
    if not target.exists():
        raise ValueError(f'missing local target: {href}')
    if target.is_dir() and source.suffix.lower() == '.html':
        target = target / 'index.html'
        if not target.exists():
            raise ValueError(f'directory has no web entry page: {href}')
    if parsed.fragment and target.suffix.lower() == '.html':
        parser = Links()
        parser.feed(target.read_text(encoding='utf-8'))
        if unquote(parsed.fragment) not in parser.ids:
            raise ValueError(f'missing HTML anchor: {href}')
    return target


def static_checks():
    failures, counts = [], {'files': 0, 'links': 0, 'json': 0, 'frozen_data': 0}
    for path in files():
        if not path.is_file():
            continue
        counts['files'] += 1
        suffix = path.suffix.lower()
        if suffix not in {'.html', '.md', '.css', '.json', '.ipynb'}:
            continue
        try:
            body = path.read_text(encoding='utf-8')
            targets = []
            if suffix in {'.json', '.ipynb'}:
                strict_json(body)
                counts['json'] += 1
            elif suffix == '.html':
                parser = Links()
                parser.feed(body)
                targets = parser.targets
            elif suffix == '.md':
                body = re.sub(r'```.*?```|~~~.*?~~~', '', body, flags=re.S)
                targets = [a or b for a, b in re.findall(
                    r'!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)', body)]
                targets += re.findall(r'^\s*\[[^\]]+\]:\s*(\S+)', body, flags=re.M)
            elif suffix == '.css':
                targets = [target.strip(' \"\'') for target in re.findall(r'url\(([^)]+)\)', body)]
            for target in targets:
                try:
                    if local_target(path, target) is not None:
                        counts['links'] += 1
                except ValueError as exc:
                    failures.append(f'{path.relative_to(ROOT)}: {exc}')
        except (ValueError, UnicodeError, OSError) as exc:
            failures.append(f'{path.relative_to(ROOT)}: {exc}')

    manifest_path = ROOT / 'SOURCE_SNAPSHOT.json'
    if manifest_path.exists():
        try:
            manifest = strict_json(manifest_path.read_text(encoding='utf-8'))
            for name, expected in manifest.get('frozen_data_sha256', {}).items():
                target = (ROOT / name).resolve()
                if not target.is_relative_to(ROOT) or not target.is_file():
                    failures.append(f'SOURCE_SNAPSHOT.json: missing frozen data {name}')
                    continue
                actual = hashlib.sha256(target.read_bytes()).hexdigest()
                if actual != expected:
                    failures.append(f'{name}: frozen research data changed; review and document a new snapshot')
                counts['frozen_data'] += 1
        except (ValueError, OSError) as exc:
            failures.append(f'SOURCE_SNAPSHOT.json: {exc}')
    return counts, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--static-only', action='store_true', help='Check links, JSON and frozen data without running project tests.')
    args = parser.parse_args()
    counts, failures = static_checks()
    print(json.dumps({'static_checks': counts, 'failures': failures}, indent=2), flush=True)
    if failures:
        return 1
    if args.static_only:
        return 0
    config = strict_json((ROOT / 'scripts' / 'checks.json').read_text(encoding='utf-8'))
    for command in config['commands']:
        command = [sys.executable if word == '{python}' else word for word in command]
        print('\nRunning: ' + ' '.join(command), flush=True)
        try:
            result = subprocess.run(command, cwd=ROOT, check=False, timeout=180)
        except (OSError, subprocess.TimeoutExpired) as exc:
            print(f'Validation could not run: {exc}', file=sys.stderr)
            return 1
        if result.returncode:
            return result.returncode
    print('Validation passed. External URLs and live data freshness are not asserted by this offline check.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
