import { chromium } from '../b1/tooling/node_modules/playwright/index.mjs';
import { createServer } from '../../simulator/server.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const server = createServer(), normal = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/free-partition-test') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    response.end('<!doctype html><meta charset="utf-8"><title>Free partition synthetic scale</title>');
  } else if (['/tests/free/partition-browser-contracts.mjs', '/tests/free/evidence-contracts.mjs'].includes(path)) {
    response.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8'});
    response.end(await readFile(new URL('./' + path.split('/').at(-1), import.meta.url)));
  } else normal(request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/free-partition-test`);
  const results = [], sourceHashes = {};
  for (const directory of ['src/data', 'src/b1', 'tests/free']) for (const path of await readdir(directory, {recursive: true})) {
    if (!path.endsWith('.mjs')) continue;
    const file = `${directory}/${path}`;
    sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  const report = () => ({evidence: 'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY', realChatGPT: 'NOT_RUN', mv3: 'NOT_RUN', navigationLatency: 'NOT_RUN', browser: browser.version(), headless: true, results, sourceHashes});
  const sizes = process.env.FREE_RECOVERY_ONLY ? [] : (process.env.FREE_SCALE_SIZES ?? '1000,10000,100000').split(',').map(Number);
  for (const size of sizes) for (const distribution of ['mixed', 'single-project']) {
    const result = await page.evaluate(async options => {
      const {runPartitionBenchmark} = await import('/tests/free/partition-browser-contracts.mjs');
      return runPartitionBenchmark(options);
    }, {size, distribution});
    results.push(result); console.log(JSON.stringify(result));
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report(), null, 2) + '\n');
  }
  const recovery = await page.evaluate(async () => (await import('/tests/free/partition-browser-contracts.mjs')).runPartitionRecovery());
  results.push(recovery); console.log(JSON.stringify(recovery));
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report(), null, 2) + '\n');
  const evidence = await page.evaluate(async () => (await import('/tests/free/evidence-contracts.mjs')).runFreeEvidenceContracts(indexedDB));
  results.push(...evidence);for(const result of evidence)console.log(JSON.stringify(result));
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report(), null, 2) + '\n');
  if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
