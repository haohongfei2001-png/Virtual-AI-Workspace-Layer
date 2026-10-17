import test from 'node:test';
import assert from 'node:assert/strict';
import {css} from '../../src/navigation/styles.mjs';
test('narrow owned workspace reflows title and required actions without hiding either',()=>{
 const narrow=css.slice(css.indexOf('@media(max-width:240px)'));
 for(const rule of ['.workspace{padding:8px}', '.card-head{flex-wrap:wrap', '.card h2{flex:1 0 100%', '.card-actions{margin-left:auto;opacity:1}', '.search{padding:6px}', '.working-set-row>.row{flex-basis:100%!important;width:100%}'])assert(narrow.includes(rule),rule);
 assert(!/display\s*:\s*none|visibility\s*:\s*hidden/.test(narrow));
 assert(narrow.includes('.arrows{float:none;display:flex;position:sticky'));
});
test('narrow rule does not alter host native regions or widen owned frame',()=>{
 const narrow=css.slice(css.indexOf('@media(max-width:240px)'));
 assert(!/aside|#reading|#composer|position:fixed|100vw/.test(narrow));
 assert(css.includes('@media(max-width:760px)'));
});
