"""Run with Python stdlib; all events/archives are fabricated for R0."""
import unittest
import sys
import json
import copy
import time
import zipfile
from io import BytesIO
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from experiments.r0.execution_v27.timefacts import window, bucket, instant, original_send, project, read_synthetic_zip

NOW = instant('2026-10-10T12:00:00Z')
SCOPE = ('synthetic-A','synthetic-personal')
MEMBERS = [{'id':'T0','scope':SCOPE,'nativeProject':None,'nativeTitle':'same'},
           {'id':'T1','scope':SCOPE,'nativeProject':'P1','nativeTitle':'same'},
           {'id':'T2','scope':SCOPE,'nativeProject':'P2','nativeTitle':'same'}]

def event(cid='T0', at='2026-10-10T01:00:00Z', **changes):
    result={'scope':SCOPE,'conversation':cid,'message':cid+'-m1','branch':'main','role':'user',
            'kind':'new-send','state':'committed','evidence':'SYNTHETIC_ORIGINAL_SEND','originalUserSentAt':at}
    result.update(changes)
    return result

def coverage(through='2026-10-10T12:00:00Z'):
    return {m['id']:{'from':'2020-01-01T00:00:00Z','through':through,'gaps':[],
                    'evidence':'SYNTHETIC_ATTESTED_COVERAGE'} for m in MEMBERS}

def archive(name='synthetic-events.json', body=None):
    stream=BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(name,body if body is not None else json.dumps({'schema':'R0_NORMALIZED_SYNTHETIC_V1','events':[]}))
    return stream.getvalue()

class CalendarTests(unittest.TestCase):
    def test_reference_windows(self):
        self.assertEqual(window(date(2026,10,10),0),(date(2026,9,11),date(2026,10,11)))
        self.assertEqual(window(date(2026,10,10),1),(date(2026,8,12),date(2026,9,11)))
    def test_120_continuous_exclusive_windows(self):
        for k in range(120):
            lo,hi=window(date(2026,10,10),k)
            self.assertEqual((hi-lo).days,30)
            self.assertEqual(window(date(2026,10,10),k+1)[1],lo)
    def test_current_boundary(self):
        self.assertEqual(bucket(instant('2026-09-10T15:00:00Z'),NOW,'Asia/Tokyo'),0)
        self.assertEqual(bucket(instant('2026-09-10T14:59:59Z'),NOW,'Asia/Tokyo'),1)
    def test_leap_day(self):
        self.assertEqual(window(date(2024,3,29),0)[0],date(2024,2,29))
    def test_dst_is_not_720_hours(self):
        from zoneinfo import ZoneInfo
        z=ZoneInfo('America/New_York')
        lo,hi=window(date(2026,3,20),0)
        seconds=(datetime.combine(hi,datetime.min.time(),z).astimezone(timezone.utc)-datetime.combine(lo,datetime.min.time(),z).astimezone(timezone.utc)).total_seconds()
        self.assertEqual(seconds,719*3600)
    def test_timezone_reprojects_not_mutates(self):
        at=instant('2026-09-10T15:00:00Z')
        self.assertEqual(bucket(at,NOW,'Asia/Tokyo'),0)
        self.assertEqual(bucket(at,NOW,'America/New_York'),1)
        self.assertEqual(at.isoformat(),'2026-09-10T15:00:00+00:00')
    def test_midnight_reprojects(self):
        at=instant('2026-09-10T15:00:00Z')
        self.assertEqual(bucket(at,instant('2026-10-10T14:59:59Z'),'Asia/Tokyo'),0)
        self.assertEqual(bucket(at,instant('2026-10-10T15:00:00Z'),'Asia/Tokyo'),1)
    def test_future_and_naive_rejected(self):
        self.assertIsNone(bucket(NOW+timedelta(seconds=1),NOW,'Asia/Tokyo'))
        self.assertIsNone(instant('2026-10-10T12:00:00'))
        with self.assertRaises(ValueError): window(date(2026,10,10),-1)

class EvidenceTests(unittest.TestCase):
    def test_only_original_committed_new_user_send(self):
        self.assertIsNotNone(original_send(event(),SCOPE,NOW))
        for change in ({'role':'assistant'},{'kind':'edit'},{'kind':'visit'},{'kind':'rename'},
                       {'kind':'pin'},{'state':'pending'},{'evidence':'observed-local-clock'},
                       {'originalUserSentAt':None},{'branch':''},{'message':''}):
            self.assertIsNone(original_send(event(**change),SCOPE,NOW),change)
    def test_updated_visited_imported_never_fallback(self):
        e=event(originalUserSentAt=None,updated_at=NOW.isoformat(),visited_at=NOW.isoformat(),importedAt=NOW.isoformat())
        self.assertIsNone(original_send(e,SCOPE,NOW))
    def test_old_snapshot_cannot_prove_current_absence(self):
        result=project(SCOPE,MEMBERS,[event(at='2026-08-20T00:00:00Z')],coverage('2026-08-21T00:00:00Z'),NOW,'Asia/Tokyo')
        self.assertIsNone(result['segment'])
        self.assertEqual(result['reachable'],['T0','T1','T2'])
    def test_current_positive_event_suffices_for_theme(self):
        result=project(SCOPE,MEMBERS,[event()],{},NOW,'Asia/Tokyo')
        self.assertEqual(result['segment'],0)
        self.assertEqual(result['children']['T1'],'unknown')
    def test_all_member_coverage_needed_for_old_theme(self):
        c=coverage();del c['T2']
        self.assertIsNone(project(SCOPE,MEMBERS,[event(at='2026-08-20T00:00:00Z')],c,NOW,'Asia/Tokyo')['segment'])
    def test_coverage_gap_rejects_old(self):
        c=coverage();c['T2']['gaps']=[['2026-09-01','2026-09-02']]
        self.assertIsNone(project(SCOPE,MEMBERS,[event(at='2026-08-20T00:00:00Z')],c,NOW,'Asia/Tokyo')['segment'])
    def test_theme_unique_latest_and_old_stays_parent(self):
        events=[event(at='2026-07-01T00:00:00Z',message='older'),event(),event('T1','2026-08-20T00:00:00Z')]
        result=project(SCOPE,MEMBERS,events,coverage(),NOW,'Asia/Tokyo')
        self.assertEqual(result['segment'],0)
        self.assertEqual(result['children'],{'T0':'recent','T1':'old','T2':'unknown'})
    def test_old_child_without_coverage_remains_unknown(self):
        r=project(SCOPE,MEMBERS,[event(),event('T1','2026-08-20T00:00:00Z')],{},NOW,'Asia/Tokyo')
        self.assertEqual(r['children']['T1'],'unknown')
    def test_cross_project_reference_and_native_title_immutable(self):
        before=copy.deepcopy(MEMBERS)
        result=project(SCOPE,MEMBERS,[event(m['id']) for m in MEMBERS],{},NOW,'Asia/Tokyo')
        self.assertEqual(result['reachable'],['T0','T1','T2']);self.assertEqual(MEMBERS,before)
    def test_same_title_different_scope_rejected(self):
        for scope in [('synthetic-B','synthetic-personal'),('synthetic-A','synthetic-org')]:
            members=copy.deepcopy(MEMBERS);members[1]['scope']=scope
            with self.assertRaises(ValueError):project(SCOPE,members,[event()],{},NOW,'Asia/Tokyo')
    def test_message_duplicate_is_idempotent(self):
        self.assertEqual(project(SCOPE,MEMBERS,[event()],{},NOW,'Asia/Tokyo'),project(SCOPE,MEMBERS,[event(),event()],{},NOW,'Asia/Tokyo'))
    def test_conflicting_original_times_quarantined(self):
        r=project(SCOPE,MEMBERS,[event(),event(at='2026-08-20T00:00:00Z')],coverage(),NOW,'Asia/Tokyo')
        self.assertIsNone(r['segment']);self.assertEqual(r['conflicted'],['T0'])
    def test_explicit_branch_identity(self):
        r=project(SCOPE,MEMBERS,[event(branch='old',at='2026-08-20T00:00:00Z'),event(branch='new')],coverage(),NOW,'Asia/Tokyo')
        self.assertEqual(r['segment'],0);self.assertEqual(r['conflicted'],[])

class ArchiveTests(unittest.TestCase):
    def test_normalized_fixture_only(self):
        self.assertEqual(read_synthetic_zip(archive())['schema'],'R0_NORMALIZED_SYNTHETIC_V1')
    def test_traversal_absolute_and_backslash_rejected(self):
        for name in ['../synthetic-events.json','/synthetic-events.json','..\\synthetic-events.json','chat.html']:
            with self.assertRaises(ValueError):read_synthetic_zip(archive(name))
    def test_unknown_real_format_not_pretended_supported(self):
        with self.assertRaises(ValueError):read_synthetic_zip(archive(body='{"conversations":[]}'))
    def test_invalid_utf8_rejected(self):
        with self.assertRaises(UnicodeDecodeError):read_synthetic_zip(archive(body=b'\xff\xfe'))
    def test_compression_bomb_rejected(self):
        with self.assertRaises(ValueError):read_synthetic_zip(archive(body=b'x'*200000))
    def test_malformed_zip_rejected(self):
        with self.assertRaises(zipfile.BadZipFile):read_synthetic_zip(b'not a zip')

if __name__=='__main__':
    class Recording(unittest.TextTestResult):
        def startTest(self,test):super().startTest(test);self.t=time.monotonic()
        def addSuccess(self,test):super().addSuccess(test);rows.append({'id':test.id(),'status':'PASS','level':'OFFLINE_LOGIC','ms':round((time.monotonic()-self.t)*1000,2)})
        def addFailure(self,test,err):super().addFailure(test,err);rows.append({'id':test.id(),'status':'FAIL','error':self._exc_info_to_string(err,test),'level':'OFFLINE_LOGIC'})
        def addError(self,test,err):super().addError(test,err);rows.append({'id':test.id(),'status':'ERROR','error':self._exc_info_to_string(err,test),'level':'OFFLINE_LOGIC'})
    rows=[]
    result=unittest.TextTestRunner(verbosity=2,resultclass=Recording).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps({'python':sys.version,'data':'synthetic only','tests':rows},indent=2))
    sys.exit(not result.wasSuccessful())
