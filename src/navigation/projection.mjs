/** Pure v2.7 projection. No storage, host authentication, text capture or native writes. */
const DAY = 86400000;
const dayFormatters=new Map();
export function instant(value) {
  if (typeof value !== 'string') return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m)return null;
  const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
  const check=new Date(0);check.setUTCFullYear(year,month-1,day);
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
  if(m[7]!=='Z'&&(Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59))return null;
  const n = Date.parse(value); return Number.isFinite(n) ? n : null;
}
export function localDay(value, timeZone) {
  const n = typeof value === 'number' ? value : instant(value);
  if (n === null || !Number.isFinite(n)) throw Error('invalid-instant');
  let formatter=typeof timeZone==='string'?dayFormatters.get(timeZone):null;
  if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});if(typeof timeZone==='string'){if(dayFormatters.size>=16)dayFormatters.delete(dayFormatters.keys().next().value);dayFormatters.set(timeZone,formatter);}}
  const parts=formatter.formatToParts(n);
  const get = key => Number(parts.find(p => p.type === key).value);
  return Date.UTC(get('year'), get('month')-1, get('day')) / DAY;
}
export function segmentFor(value, now, timeZone) {
  const t = instant(value), current = instant(now);
  if (t === null || current === null || t > current) return null;
  return Math.floor((localDay(current, timeZone) - localDay(t, timeZone)) / 30);
}
export function windowFor(k, now, timeZone) {
  if (!Number.isInteger(k) || k < 0) throw Error('invalid-segment');
  const end = localDay(now, timeZone) + 1 - k * 30;
  const fmt = d => new Date(d * DAY).toISOString().slice(0,10);
  return {start:fmt(end-30), endExclusive:fmt(end)};
}
export function latestSend(ref, now) {
  const current=instant(now);if(current===null)return null;
  const events = new Map(); let conflict = false;
  for (const e of ref.events ?? []) {
    if (e.role !== 'user' || e.kind !== 'new-send' || e.state !== 'committed' || !e.messageId || !e.branchId || e.source !== 'synthetic-original-send') continue;
    const t = instant(e.sentAt); if (t === null || t > current) continue;
    const key = e.branchId + ':' + e.messageId;
    if (events.has(key) && events.get(key) !== t) conflict = true;
    events.set(key, t);
  }
  return conflict || !events.size ? null : new Date(Math.max(...events.values())).toISOString();
}
function covered(ref, from, now) {
  const c = ref.coverage;
  return !!c && c.source === 'synthetic-attested-snapshot' && c.gaps === 0 &&
    instant(c.from) !== null && instant(c.through) !== null &&
    instant(c.from) <= instant(from) && instant(c.through) >= instant(now);
}
export function project(snapshot, now, timeZone) {
  if (!snapshot?.scope || !Array.isArray(snapshot.refs) || !Array.isArray(snapshot.themes)) throw Error('invalid-snapshot');
  localDay(now, timeZone);
  const refs = new Map();
  for (const ref of snapshot.refs) {
    if (ref.scope !== snapshot.scope || refs.has(ref.id)) throw Error('cross-scope-or-duplicate');
    refs.set(ref.id, ref);
  }
  return snapshot.themes.map(theme => {
    if (theme.scope !== snapshot.scope || new Set(theme.members).size !== theme.members.length) throw Error('invalid-theme');
    const members = theme.members.map(id => refs.get(id)).filter(Boolean);
    const times = members.map(r => latestSend(r, now)).filter(Boolean).sort();
    const latest = times.at(-1) ?? null;
    let segment = latest ? segmentFor(latest, now, timeZone) : null;
    if (segment !== 0 && (!latest || members.length !== theme.members.length || !members.every(r => covered(r, latest, now)))) segment = null;
    const current = [], old = [], unknown = [];
    for (const r of members) {
      const sent = latestSend(r, now), own = sent ? segmentFor(sent, now, timeZone) : null;
      if (segment === null || own === null || (own > segment && !covered(r, sent, now))) unknown.push(r);
      else if (own === segment) current.push(r);
      else if (own > segment) old.push(r);
      else unknown.push(r);
    }
    return {...theme, segment, latest, current, old, unknown};
  });
}
export function initialView() {
  return {segment:0, oldOpen:new Set(), sidebarOpen:new Set(), capacities:new Map(), scroll:0, mode:'reading', sidebarVisible:true};
}
