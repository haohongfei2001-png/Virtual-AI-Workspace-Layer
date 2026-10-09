#!/usr/bin/env python3
"""Opt-in clean local-browser runner. Uses installed Playwright/Chromium; never installs anything.
Only localhost fixture requests are permitted. No real account/profile/extension is touched.
"""
import argparse
import hashlib
import http.server
import json
import pathlib
import platform
import sys
import threading
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--chromium', required=True, help='Existing Chromium executable, in an authorized isolated test environment')
p.add_argument('--output', default=str(ROOT / 'docs/experiments/results/r0-local-browser.json'))
a = p.parse_args()
report = {'schema': 'vawl-r0-local-browser-v1', 'startedAt': datetime.now(timezone.utc).isoformat(),
          'evidence': 'BROWSER_FIXTURE', 'platform': platform.platform(), 'runs': [], 'externalRequests': [], 'errors': [], 'scriptErrors': []}
server = None
browser = None
phase = 'DEPENDENCIES'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args):
        pass
try:
    from playwright.sync_api import sync_playwright
    if not pathlib.Path(a.chromium).is_file():
        raise FileNotFoundError('Specified Chromium executable does not exist; runner does not install software')
    phase = 'LOCAL_SERVER'
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        phase = 'BROWSER_LAUNCH'
        browser = pw.chromium.launch(executable_path=a.chromium, headless=True)
        phase = 'FIXTURE_EXECUTION'
        report['chromiumVersion'] = browser.version
        for width, height in [(1440, 1000), (390, 844)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            def guard(route):
                if route.request.url.startswith(origin + '/'):
                    route.continue_()
                else:
                    report['externalRequests'].append({'method': route.request.method, 'url': route.request.url})
                    route.abort()
            context.route('**/*', guard)
            page = context.new_page()
            errors = []
            def capture_error(error):
                errors.append(str(error))
                report['scriptErrors'].append(str(error))
            page.on('pageerror', capture_error)
            page.goto(origin + '/experiments/r0/fixture.html')
            # Repeated execution proves cleanup is not only a first-run property.
            for repeat in [1, 2]:
                page.get_by_role('button', name='Run fixture suite', exact=True).click()
                page.get_by_text('fixture assertions passed;', exact=False).wait_for()
                result = json.loads(page.locator('#report').text_content())
                result['repeat'] = repeat
                result['scriptErrors'] = list(errors)
                result['horizontalOverflow'] = page.evaluate('document.documentElement.scrollWidth > innerWidth')
                report['runs'].append(result)
            context.close()
        browser.close()
    failed = any(r['fail'] or r['scriptErrors'] or r['horizontalOverflow'] for r in report['runs']) or bool(report['externalRequests'])
    report['status'] = 'FAIL' if failed else 'PASS'
except Exception as error:
    report['status'] = 'BLOCKED' if phase in ['DEPENDENCIES', 'LOCAL_SERVER', 'BROWSER_LAUNCH'] else 'FAIL'
    report['errors'].append({'type': type(error).__name__, 'message': str(error)})
finally:
    if server:
        server.shutdown()
    report['lastPhase'] = phase
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    report['sourceSha256'] = {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest()
                             for folder in ['experiments/r0', 'tests/r0']
                             for f in sorted((ROOT / folder).rglob('*')) if f.is_file() and '/generated/' not in str(f)}
    output = pathlib.Path(a.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'status': report['status'], 'output': str(output), 'runs': len(report['runs'])}))
sys.exit(0 if report['status'] == 'PASS' else 2 if report['status'] == 'BLOCKED' else 1)
