"""R0 synthetic evidence calculus, NOT a ChatGPT export/DOM adapter.

An attested fixture flag is a test precondition, not authentication. No network,
private data, host timestamp guessing, or production repository is involved.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo
from io import BytesIO
from pathlib import PurePosixPath
import json
import zipfile

RULE = 'fixed-30-local-calendar-days-v2.7'

def instant(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (ValueError, OverflowError):
        return None

def window(today: date, segment: int) -> tuple[date, date]:
    if type(segment) is not int or segment < 0:
        raise ValueError('segment must be a nonnegative integer')
    end = today + timedelta(days=1 - 30 * segment)
    return end - timedelta(days=30), end

def bucket(at: datetime, now: datetime, zone: str) -> int | None:
    if not at.tzinfo or not now.tzinfo:
        raise ValueError('timezone-aware instants required')
    if at > now:
        return None
    tz = ZoneInfo(zone)
    return (now.astimezone(tz).date() - at.astimezone(tz).date()).days // 30

def original_send(event: dict, scope: tuple[str, str], now: datetime) -> datetime | None:
    # These evidence labels are synthetic. A production adapter must establish them.
    if (tuple(event.get('scope', ())) != scope or event.get('role') != 'user'
        or event.get('kind') != 'new-send' or event.get('state') != 'committed'
        or event.get('evidence') != 'SYNTHETIC_ORIGINAL_SEND'
        or not all(isinstance(event.get(k), str) and event[k] for k in ('conversation','message','branch'))):
        return None
    at = instant(event.get('originalUserSentAt'))
    return at if at is not None and at <= now else None

def covers(coverage: dict | None, after: datetime, now: datetime) -> bool:
    if not coverage or coverage.get('evidence') != 'SYNTHETIC_ATTESTED_COVERAGE' or coverage.get('gaps') != []:
        return False
    start, end = instant(coverage.get('from')), instant(coverage.get('through'))
    return start is not None and end is not None and start <= after <= now <= end

def project(scope: tuple[str, str], members: list[dict], events: list[dict],
            coverage: dict, now: datetime, zone: str) -> dict:
    """One theme, one segment; old children stay with the parent. Unknowns stay reachable."""
    if not members or any(tuple(m.get('scope', ())) != scope for m in members):
        raise ValueError('missing members or cross-account/organization reference')
    ids = [m['id'] for m in members]
    if len(set(ids)) != len(ids):
        raise ValueError('duplicate native reference in this fixture theme')
    latest = {}
    seen = {}
    conflicted = set()
    for event in events:
        at = original_send(event, scope, now)
        if at is None or event['conversation'] not in ids:
            continue
        key = (event['conversation'], event['branch'], event['message'])
        if key in seen and seen[key] != at:
            conflicted.add(event['conversation'])
        seen[key] = at
    for (conversation, _branch, _message), at in seen.items():
        if conversation not in conflicted:
            latest[conversation] = max(at, latest.get(conversation, at))
    best = max(latest.values(), default=None)
    segment = bucket(best, now, zone) if best else None
    if conflicted:
        segment = None
    if segment is not None and segment > 0 and not all(covers(coverage.get(i), best, now) for i in ids):
        segment = None
    children = {}
    for i in ids:
        at = latest.get(i)
        own = bucket(at, now, zone) if at else None
        if segment is None or own is None:
            children[i] = 'unknown'
        elif own == segment:
            children[i] = 'recent'
        elif own > segment and covers(coverage.get(i), at, now):
            children[i] = 'old'
        else:
            children[i] = 'unknown'
    return {'rule':RULE, 'segment':segment, 'children':children, 'reachable':ids,
            'conflicted':sorted(conflicted)}

def read_synthetic_zip(data: bytes) -> dict:
    """Bounded normalized fixture parser only; does NOT claim official-export compatibility."""
    if len(data) > 2_000_000:
        raise ValueError('archive too large')
    with zipfile.ZipFile(BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != 1:
            raise ValueError('expected one normalized fixture file')
        entry = entries[0]
        path = PurePosixPath(entry.filename)
        if (path.is_absolute() or '..' in path.parts or '\\' in entry.filename
            or entry.filename != 'synthetic-events.json' or entry.flag_bits & 1
            or entry.file_size > 1_000_000 or entry.file_size > max(1,entry.compress_size)*100):
            raise ValueError('unsupported/unsafe fixture archive')
        payload = json.loads(archive.read(entry).decode('utf-8', errors='strict'))
        if not isinstance(payload, dict) or payload.get('schema') != 'R0_NORMALIZED_SYNTHETIC_V1':
            raise ValueError('unknown schema; not an official export adapter')
        return payload
