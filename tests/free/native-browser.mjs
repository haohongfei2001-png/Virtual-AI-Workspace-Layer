import { chromium } from '../b1/tooling/node_modules/playwright/index.mjs';
import { createServer } from '../../simulator/server.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const server = createServer(), normal = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/free-native-test') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    response.end('<!doctype html><meta charset="utf-8"><title>Free isolated IndexedDB tests</title>');
  } else if (path === '/tests/free/browser-contracts.mjs') {
    response.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8'});
    response.end(await readFile(new URL('./browser-contracts.mjs', import.meta.url)));
  } else normal(request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/free-native-test`);
  const report = await page.evaluate(async () => {
    const {runNativeContracts} = await import('/tests/free/browser-contracts.mjs');
    return runNativeContracts();
  });
  const sourceHashes = {};
  for (const directory of ['src', 'simulator', 'tests/free']) {
    for (const path of await readdir(directory, {recursive: true})) {
      if (!path.endsWith('.mjs')) continue;
      const file = `${directory}/${path}`;
      sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  const result = {...report, browser: browser.version(), headless: true, sourceHashes};
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({...result, sourceHashes: undefined}, null, 2));
  if (report.fail) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
