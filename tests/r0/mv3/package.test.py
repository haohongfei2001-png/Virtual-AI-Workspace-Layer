"""Static packaging contracts only. No browser, server, extension load or installation."""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'experiments/r0/mv3'
BUILD = SOURCE / 'build-probe.mjs'


class PackageContracts(unittest.TestCase):
    def test_exact_manifest_permission_surface(self):
        manifest = json.loads((SOURCE / 'manifest.json').read_text())
        self.assertEqual(set(manifest), {'manifest_version', 'name', 'version', 'description',
                         'minimum_chrome_version', 'background', 'content_scripts', 'content_security_policy'})
        self.assertEqual(manifest['manifest_version'], 3)
        self.assertEqual(manifest['background'], {'service_worker': 'worker.mjs', 'type': 'module'})
        self.assertEqual(manifest['content_scripts'], [{'matches': ['http://127.0.0.1/r0-mv3-fixture/*'],
                         'js': ['content.js'], 'run_at': 'document_idle', 'all_frames': False}])
        self.assertEqual(manifest['content_security_policy']['extension_pages'],
                         "script-src 'self'; object-src 'none'")
        # No host_permissions, permissions, externally_connectable, web_accessible_resources or dynamic code.

    def test_assembly_is_deterministic_and_modules_remain_exact(self):
        with tempfile.TemporaryDirectory(prefix='r0-mv3-source-only-') as root:
            builds = []
            for index in [0, 1]:
                out = pathlib.Path(root) / str(index)
                result = subprocess.run(['node', str(BUILD), str(out)], capture_output=True, text=True, check=True)
                self.assertEqual(json.loads(result.stdout)['status'], 'ASSEMBLED_NOT_LOADED')
                self.assertEqual({p.name for p in out.iterdir()}, {'manifest.json', 'protocol.mjs', 'worker.mjs', 'content.js'})
                for name in ['manifest.json', 'protocol.mjs', 'worker.mjs']:
                    self.assertEqual((out / name).read_bytes(), (SOURCE / name).read_bytes())
                for name in ['content.js', 'worker.mjs', 'protocol.mjs']:
                    subprocess.run(['node', '--check', str(out / name)], check=True, capture_output=True)
                builds.append({p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir()})
            self.assertEqual(builds[0], builds[1])

    def test_existing_output_and_repository_paths_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='r0-mv3-source-only-') as root:
            out = pathlib.Path(root); sentinel = out / 'keep.txt'; sentinel.write_text('keep')
            result = subprocess.run(['node', str(BUILD), str(out)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(sentinel.read_text(), 'keep')
        result = subprocess.run(['node', str(BUILD), str(SOURCE)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    def test_fixture_has_no_page_script_and_native_island_is_separate(self):
        html = (SOURCE / 'host-fixture.html').read_text()
        self.assertNotIn('<script', html.lower())
        self.assertEqual(html.count('data-vawl-r0-mv3-slot="exclusive"'), 1)
        for identifier in ['native-transcript', 'native-composer', 'native-model', 'native-tools']:
            self.assertEqual(html.count('id="' + identifier + '"'), 1)
        self.assertIn("default-src 'none'", html)


if __name__ == '__main__':
    unittest.main()

