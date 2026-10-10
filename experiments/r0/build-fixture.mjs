/** Bundle source-identical modules into one local HTML file for isolated fixture transport. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = resolve(process.argv[2] ?? resolve(root, 'experiments/r0/generated/fixture.html'));
const files = ['experiments/r0/core.mjs', 'experiments/r0/shell.mjs', 'tests/r0/samples.mjs', 'tests/r0/browser-suite.mjs'];
const script = files.map(file => readFileSync(resolve(root, file), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
if (script.includes('</script')) throw new Error('Unsafe script delimiter in source');
const html = readFileSync(resolve(root, 'experiments/r0/fixture.html'), 'utf8').replace('<script type="module" src="../../tests/r0/browser-suite.mjs"></script>', `<script type="module">\n${script}\n</script>`);
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, html); console.log(target);
