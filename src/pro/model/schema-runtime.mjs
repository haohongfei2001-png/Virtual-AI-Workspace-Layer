import {stable} from '../../data/hash.mjs';

const encoder = new TextEncoder();
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function exact(value, required, optional = []) {
  if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))) throw Error('invalid-schema');
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) throw Error('accessor-denied');
  }
  return value;
}
export function integer(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error('invalid-integer');
  return value;
}
export function boundedText(value, maximum = 200, minimum = 1) {
  if (typeof value !== 'string' || [...value].length > maximum || [...value].length < minimum ||
      (minimum > 0 && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw Error('invalid-text');
  return value;
}
export function boundedJSON(input, {maxBytes = 65536, maxDepth = 12, maxNodes = 10000} = {}) {
  let value = input;
  if (typeof input === 'string') {
    if (encoder.encode(input).byteLength > maxBytes) throw Error('response-too-large');
    try { value = JSON.parse(input); } catch { throw Error('invalid-json'); }
  }
  let nodes = 0;
  const active = new WeakSet();
  function inspect(v, depth) {
    if (++nodes > maxNodes || depth > maxDepth) throw Error('json-complexity-limit');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || active.has(v)) throw Error('invalid-json-value');
    const array = Array.isArray(v);
    if (array ? Object.getPrototypeOf(v) !== Array.prototype : !plain(v)) throw Error('invalid-json-prototype');
    active.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable) throw Error('invalid-json-property');
      inspect(descriptors[key].value, depth + 1);
    }
    if (array && (v.length > maxNodes || Object.keys(v).length !== v.length)) throw Error('invalid-json-array');
    active.delete(v);
  }
  inspect(value, 0);
  if (encoder.encode(stable(value)).byteLength > maxBytes) throw Error('response-too-large');
  return structuredClone(value);
}

/** Small explicit interpreter for the frozen schema vocabulary. Unsupported
 * keywords are rejected when checking the schema itself, never silently ignored. */
export function validateSchema(input, schema) {
  const value = boundedJSON(input);
  const supported = new Set(['$defs', '$ref', '$schema', '$id', 'title', 'description', 'additionalProperties', 'properties', 'required', 'anyOf', 'const', 'enum', 'type', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern']);
  const inspectSchema = (node, depth = 0) => {
    if (!plain(node) || depth > 24 || Object.keys(node).some(key => !supported.has(key))) throw Error('unsupported-schema-keyword');
    if (node.properties) Object.values(node.properties).forEach(child => inspectSchema(child, depth + 1));
    if (node.$defs) Object.values(node.$defs).forEach(child => inspectSchema(child, depth + 1));
    if (node.items) inspectSchema(node.items, depth + 1);
    if (node.anyOf) node.anyOf.forEach(child => inspectSchema(child, depth + 1));
  };
  inspectSchema(schema);
  const check = (v, s, depth = 0) => {
    if (depth > 24) throw Error('schema-depth-limit');
    if (s.$ref) {
      if (!/^#\/\$defs\/[A-Za-z][A-Za-z0-9]*$/.test(s.$ref)) throw Error('unsupported-schema-ref');
      const def = schema.$defs?.[s.$ref.split('/').at(-1)];
      if (!def) throw Error('missing-schema-ref');
      return check(v, def, depth + 1);
    }
    if (s.anyOf) {
      if (!s.anyOf.some(choice => { try { check(v, choice, depth + 1); return true; } catch { return false; } })) throw Error('schema-union');
      return;
    }
    if ('const' in s && v !== s.const) throw Error('schema-const');
    if (s.enum && !s.enum.includes(v)) throw Error('schema-enum');
    switch (s.type) {
      case 'object':
        exact(v, s.required ?? [], Object.keys(s.properties ?? {}).filter(k => !(s.required ?? []).includes(k)));
        for (const [key, entry] of Object.entries(v)) check(entry, s.properties[key], depth + 1);
        break;
      case 'array':
        if (!Array.isArray(v) || v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? 10000)) throw Error('schema-array');
        v.forEach(entry => check(entry, s.items, depth + 1));
        break;
      case 'string':
        if (typeof v !== 'string' || [...v].length < (s.minLength ?? 0) || [...v].length > (s.maxLength ?? 65536) ||
            (s.pattern && !new RegExp(s.pattern, 'u').test(v))) throw Error('schema-string');
        break;
      case 'null': if (v !== null) throw Error('schema-null'); break;
      case undefined: break;
      default: throw Error('unsupported-schema-type');
    }
  };
  check(value, schema);
  return value;
}
