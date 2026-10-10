/** Deterministic source assembly only. Does not start a server/browser or load/install an extension. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..');
if (!process.argv[2]) throw new Error('Pass a dedicated output directory; source assembly only');
const out = resolve(process.argv[2]);
if (out === repository || out.startsWith(repository + '/')) throw new Error('Output must be outside the source repository');
mkdirSync(out, { recursive: true });
if (readdirSync(out).length) throw new Error('Output directory must be empty; no existing files are overwritten');
for (const name of ['manifest.json', 'protocol.mjs', 'worker.mjs'])
  writeFileSync(resolve(out, name), readFileSync(resolve(here, name)));
const body = ['protocol.mjs', 'client.mjs', 'content-entry.mjs'].map(name =>
  readFileSync(resolve(here, name), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''));
writeFileSync(resolve(out, 'content.js'), '(() => {\n"use strict";\n' + body.join('\n') + '\n})();\n');
console.log(JSON.stringify({ status: 'ASSEMBLED_NOT_LOADED', output: out, files: 4 }));

