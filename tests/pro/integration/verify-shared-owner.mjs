/** Read-only check in the working tree, mutation/testing only in a disposable
 * mirror. No Git checkout, merge, database upgrade or production composition. */
import {cp, mkdtemp, readFile, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const run = promisify(execFile), root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = 'src/runtime/host-binding-service.mjs', patch = join(root, 'tests/pro/integration/shared-owner.patch');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = sha(await readFile(join(root, source))), mirror = await mkdtemp(join(tmpdir(), 'vaiwl-pro-owner-review-'));
const files = ['tests/host/host-binding-service.test.mjs', 'tests/host/host-binding-idle.test.mjs',
  'tests/host/ui-owner.test.mjs', 'tests/host/ui-owner-isolation.test.mjs', 'tests/pro/integration/shared-owner-fixture.mjs'];
const report = {kind: 'shared-owner-patch-temporary-mirror', source, originalSHA256: original, candidateSHA256: null,
  appliedToWorkingTree: false, noLiveHost: true, noModelCalls: true, syntax: 'pending', applyCheck: 'pending', results: []};
try {
  await run('git', ['apply', '--check', patch], {cwd: root}); report.applyCheck = 'PASS';
  await cp(join(root, 'src'), join(mirror, 'src'), {recursive: true});
  await cp(join(root, 'tests'), join(mirror, 'tests'), {recursive: true});
  await run('git', ['apply', patch], {cwd: mirror});
  await run(process.execPath, ['--check', source], {cwd: mirror}); report.syntax = 'PASS';
  report.candidateSHA256 = sha(await readFile(join(mirror, source)));
  for (const file of files) {
    let stdout = '', stderr = '', exitCode = 0;
    try { ({stdout, stderr} = await run(process.execPath, ['--test-reporter=tap', file], {cwd: mirror, timeout: 60000, maxBuffer: 10 * 1024 * 1024})); }
    catch (error) { stdout = error.stdout ?? ''; stderr = error.stderr ?? ''; exitCode = error.code ?? 1; }
    const count = name => Number(stdout.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1] ?? 0);
    report.results.push({file, tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
      status: exitCode === 0 && count('tests') > 0 && count('fail') === 0 ? 'PASS' : 'FAIL',
      ...(exitCode === 0 ? {} : {output: stdout + stderr})});
  }
} finally {
  report.workingTreeUnchanged = original === sha(await readFile(join(root, source)));
  await rm(mirror, {recursive: true, force: true});
}
report.tests = report.results.reduce((sum, row) => sum + row.tests, 0);
report.passed = report.results.reduce((sum, row) => sum + row.passed, 0);
report.status = report.workingTreeUnchanged && report.syntax === 'PASS' && report.applyCheck === 'PASS' && report.results.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'PASS') process.exitCode = 1;
