import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {delayNativeBodyUntilWorkspace} from './fixtures/late-native-body-fixture.mjs';

const native=await readFile(new URL('./fixtures/native.mjs',import.meta.url),'utf8');
const start="  const reading = $('#reading'); reading.replaceChildren();\n",end="  $('#move-button').disabled = !view.conversationId;\n";
test('late body fixture preserves the original render block and all surrounding native behavior',()=>{
 const transformed=delayNativeBodyUntilWorkspace(native),a=native.indexOf(start),b=native.indexOf(end)+end.length;
 assert(transformed.startsWith(native.slice(0,a)));assert(transformed.endsWith(native.slice(b)));
 const render="  reading.replaceChildren();\n"+native.slice(a+start.length,b);
 assert.equal(transformed.split(render).length-1,1,'retain the actual message/identity renderer once');
 assert.equal(transformed.split("fetch(`/native/route?path=${encodeURIComponent(path)}`)").length-1,1,'no route replay');
 assert.equal(transformed.split("action('send-intent')").length-1,1,'native send handler remains unchanged');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(transformed),'the served native module parses');
});
test('late body fixture refuses absent, duplicate, reversed, or already transformed anchors',()=>{
 for(const source of [native.replace(start,''),native.replace(end,''),start+native,native+end,end+native.replace(end,''),delayNativeBodyUntilWorkspace(native)])assert.throws(()=>delayNativeBodyUntilWorkspace(source),/late-body-fixture/);
});
