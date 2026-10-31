// An owner-only, non-serializable mark. Exception text from a source, provider,
// authorization check or projector can never become a public message channel.
const marked=new WeakMap();
export const PUBLIC_PRO_ERRORS=Object.freeze(['alias-capacity','proposal-review-capacity','pro-storage-capacity','pro-batch-capacity']);
export function publicProError(code){if(!PUBLIC_PRO_ERRORS.includes(code))throw Error('invalid-public-pro-error');const error=Error('public-pro-operation-refused');marked.set(error,code);return error;}
export const publicProErrorCode=error=>marked.get(error)??null;
