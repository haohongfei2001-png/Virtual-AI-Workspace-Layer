/** Dependency-free R0 checks. Browser is deliberately separate and opt-in. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? '/tmp/vawl-r0-checks');
mkdirSync(output, { recursive: true });
const modules = ['experiments/r0/core.mjs', 'experiments/r0/shell.mjs', 'experiments/r0/build-fixture.mjs', 'tests/r0/core.test.mjs', 'tests/r0/samples.mjs', 'tests/r0/browser-suite.mjs', 'tests/r0/run-checks.mjs'];
const commands = modules.map(file => [process.execPath, '--check', file]);
commands.push([process.execPath, '--test', '--test-reporter=tap', 'tests/r0/core.test.mjs']);
commands.push(['python3', 'tests/r0/runner.test.py']);
commands.push(['python3', '-m', 'py_compile', 'tests/r0/run-browser.py']);
commands.push([process.execPath, 'experiments/r0/build-fixture.mjs', resolve(output, 'fixture.html')]);
const results = [];
for (const [command, ...args] of commands) {
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  results.push({ command: [command === process.execPath ? 'node' : command, ...args], status: run.status === 0 ? 'PASS' : 'FAIL', exitCode: run.status,
    stdout: run.stdout, stderr: run.stderr, error: run.error?.message });
}
const files = [];
for (const folder of ['experiments/r0', 'tests/r0']) {
  for (const file of readdirSync(resolve(root, folder), { recursive: true })) {
    if (file.includes('generated') || file.includes('__pycache__')) continue;
    try { const data = readFileSync(resolve(root, folder, file)); files.push({ path: `${folder}/${file}`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }); } catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
}
const report = { schema: 'vawl-r0-source-checks-v1', evidence: 'SYNTHETIC_CONTRACT_TEST', runAt: new Date().toISOString(),
  node: process.version, platform: `${process.platform}/${process.arch}`, results, files, browser: 'NOT_RUN_BY_THIS_COMMAND' };
writeFileSync(resolve(output, 'source-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length }));
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
