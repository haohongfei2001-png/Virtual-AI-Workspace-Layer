"""Runner error-classification unit tests; mocked launcher, not browser evidence."""
import contextlib
import io
import json
import pathlib
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

RUNNER = pathlib.Path(__file__).with_name('run-browser.py')
class StubServer:
    server_port = 12345
    def __init__(self, *args, **kwargs): pass
    def serve_forever(self): pass
    def shutdown(self): pass
class FailureClassification(unittest.TestCase):
    def invoke(self, phase):
        class StubPage:
            def on(self, *args): pass
            def goto(self, *args): raise RuntimeError('synthetic post-launch fixture failure')
        class StubContext:
            def route(self, *args): pass
            def new_page(self): return StubPage()
        class StubBrowser:
            version = 'synthetic-mock-not-browser'
            def new_context(self, **kwargs): return StubContext()
        class StubChromium:
            def launch(self, **kwargs):
                if phase == 'launch': raise OSError('synthetic launch unavailable')
                return StubBrowser()
        class StubPlaywright:
            chromium = StubChromium()
            def __enter__(self): return self
            def __exit__(self, *args): pass
        module = types.ModuleType('playwright.sync_api')
        module.sync_playwright = StubPlaywright
        with tempfile.TemporaryDirectory(prefix='vawl-r0-runner-test-') as tmp:
            tmp = pathlib.Path(tmp); executable = tmp / 'existing-synthetic-chromium'; executable.touch()
            output = tmp / 'result.json'
            with patch.dict(sys.modules, {'playwright.sync_api': module}), patch('http.server.ThreadingHTTPServer', StubServer), \
                 patch.object(sys, 'argv', [str(RUNNER), '--chromium', str(executable), '--output', str(output)]), \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as caught:
                    runpy.run_path(str(RUNNER), run_name='__main__')
            return caught.exception.code, json.loads(output.read_text())
    def test_launch_failure_is_blocked(self):
        code, result = self.invoke('launch')
        self.assertEqual((code, result['status'], result['lastPhase']), (2, 'BLOCKED', 'BROWSER_LAUNCH'))
        self.assertEqual(result['runs'], [])
    def test_post_launch_fixture_failure_is_fail(self):
        code, result = self.invoke('fixture')
        self.assertEqual((code, result['status'], result['lastPhase']), (1, 'FAIL', 'FIXTURE_EXECUTION'))
        self.assertEqual(result['runs'], [])
if __name__ == '__main__': unittest.main(verbosity=2)
