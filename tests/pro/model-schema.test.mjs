import test from 'node:test';
import assert from 'node:assert/strict';
import {validateModelSchema} from '../../src/pro/model/validate.mjs';
import {boundedJSON} from '../../src/pro/model/schema-runtime.mjs';

const existing = () => ({schemaVersion: 'vaiwl-pro-model-output/1', requestNonce: 'synthetic_nonce', items: [{kind: 'EXISTING',
  conversationHandle: 'c_fixture', topicHandle: 't_fixture', titleSuggestion: null, evidenceHandles: ['c_fixture'], reason: 'same-object-goal', explanation: ''}]});

test('frozen four output variants validate and UNKNOWN cannot carry title', () => {
  const value = existing(); assert.deepEqual(validateModelSchema(value), value);
  const newTopic = structuredClone(value); newTopic.items[0].kind = 'NEW_TOPIC'; delete newTopic.items[0].topicHandle;
  newTopic.items[0].seed = {name: '积分核对', object: '积分', goal: '核对', outcome: null, qualifiers: []}; assert.doesNotThrow(() => validateModelSchema(newTopic));
  const multi = structuredClone(value); multi.items[0].kind = 'MULTI_TOPIC'; delete multi.items[0].topicHandle; multi.items[0].primaryTopicHandle = 't_one'; multi.items[0].relatedTopicHandles = ['t_two']; assert.doesNotThrow(() => validateModelSchema(multi));
  const unknown = structuredClone(value); unknown.items[0].kind = 'UNKNOWN'; delete unknown.items[0].topicHandle; unknown.items[0].reason = 'insufficient-evidence'; unknown.items[0].evidenceHandles = [];
  assert.doesNotThrow(() => validateModelSchema(unknown)); unknown.items[0].titleSuggestion = '虚构'; assert.throws(() => validateModelSchema(unknown));
});

for (const [name, mutate] of [
  ['authority', value => { value.grant = 'admin'; }],
  ['scope', value => { value.items[0].scopeKey = 'private'; }],
  ['confidence', value => { value.items[0].confidence = 0.99; }],
  ['native action', value => { value.items[0].kind = 'MOVE_NATIVE_PROJECT'; }],
  ['URL handle', value => { value.items[0].topicHandle = 'https://evil.invalid'; }],
  ['no evidence', value => { value.items[0].evidenceHandles = []; }],
  ['overlong title', value => { value.items[0].titleSuggestion = '字'.repeat(141); }],
  ['too many items', value => { value.items = Array.from({length: 11}, () => structuredClone(value.items[0])); }],
  ['NaN', value => { value.items[0].confidence = NaN; }],
]) test('A22/A23 rejects ' + name, () => { const value = existing(); mutate(value); assert.throws(() => validateModelSchema(value)); });

test('bounded JSON refuses non-JSON/prototypes/accessors without invoking getter', () => {
  let calls = 0;
  const value = existing(); Object.defineProperty(value, 'grant', {enumerable: true, get() { calls++; return 'admin'; }});
  assert.throws(() => boundedJSON(value), /invalid-json-property/); assert.equal(calls, 0);
  assert.throws(() => boundedJSON(Object.create({grant: true})), /invalid-json-prototype/);
  assert.throws(() => boundedJSON('{"__proto__":{"grant":true}}'), /invalid-json-property/);
  const cyclic = {}; cyclic.self = cyclic; assert.throws(() => boundedJSON(cyclic), /invalid-json-value/);
  assert.throws(() => boundedJSON('x'.repeat(65537)), /response-too-large/);
  let depth = {}; for (let i = 0; i < 14; i++) depth = {next: depth}; assert.throws(() => boundedJSON(depth), /json-complexity-limit/);
  const sparse = new Array(3); assert.throws(() => boundedJSON(sparse), /invalid-json-array/);
});
