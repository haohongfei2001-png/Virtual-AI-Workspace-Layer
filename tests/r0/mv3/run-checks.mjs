/** Source-only R0 MV3 preparation checks. Never starts a browser/server or installs/loads an extension. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.argv[2] ?? '/tmp/vawl-r0-mv3-source-checks');
mkdirSync(output, { recursive: true });
const modules = ['protocol.mjs', 'client.mjs', 'worker.mjs', 'content-entry.mjs', 'build-probe.mjs']
  .map(name => 'experiments/r0/mv3/' + name)
  .concat(['protocol.test.mjs', 'client.test.mjs', 'runtime.test.mjs', 'entry.test.mjs', 'run-checks.mjs'].map(name => 'tests/r0/mv3/' + name));
const commands = modules.map(file => [process.execPath, '--check', file]);
commands.push([process.execPath, '--test', '--test-reporter=tap', 'tests/r0/mv3/protocol.test.mjs', 'tests/r0/mv3/client.test.mjs', 'tests/r0/mv3/runtime.test.mjs', 'tests/r0/mv3/entry.test.mjs']);
commands.push(['python3', 'tests/r0/mv3/package.test.py']);
commands.push([process.execPath, 'tests/r0/run-checks.mjs', resolve(output, 'original-contracts')]);
const results = [];
for (const [command, ...args] of commands) {
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPYCACHEPREFIX: resolve(output, 'pycache') } });
  results.push({ command: [command === process.execPath ? 'node' : command, ...args], status: run.status === 0 ? 'PASS' : 'FAIL',
    exitCode: run.status, stdout: run.stdout, stderr: run.stderr, error: run.error?.message });
}
const files = [];
for (const folder of ['experiments/r0/mv3', 'tests/r0/mv3']) {
  for (const name of readdirSync(resolve(root, folder)).sort()) {
    const path = folder + '/' + name;
    const data = readFileSync(resolve(root, path));
    files.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
}
const original = JSON.parse(readFileSync(resolve(output, 'original-contracts/source-checks.json'), 'utf8'));
const report = { schema: 'vawl-r0-mv3-preparation-checks-v1', evidence: 'SYNTHETIC_CONTRACT_TEST',
  runAt: new Date().toISOString(), node: process.version, platform: process.platform + '/' + process.arch,
  results, files, originalContractResults: original.results,
  extensionLoaded: false, browserStarted: false, liveHost: 'NOT_RUN', actualMv3Lifecycle: 'NOT_RUN' };
writeFileSync(resolve(output, 'source-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, pass: results.filter(r => r.status === 'PASS').length,
  fail: results.filter(r => r.status === 'FAIL').length, extensionLoaded: false, browserStarted: false }));
process.exitCode = results.some(r => r.status !== 'PASS') ? 1 : 0;

