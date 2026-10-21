import assert from 'node:assert/strict';
// Current members may be bare rows or wrapped by the production workset action.
// Do not select arbitrary descendants: expanded .old-list rows must stay separate.
export const UI10_CURRENT_MEMBER_ROWS='.card .members > .row, .card .members > .working-set-row > .row';
export function assertUi10CurrentMemberIds(ids,count,allowed){assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert(ids.every(id=>allowed.includes(id)),'non-current member leaked into current rows');return true;}
