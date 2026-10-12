import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'experiments/r0/time-source'))
from fields import StreamReducer,reduce_event
class Fields(unittest.TestCase):
 def test_fragmented_event_selectivity(self):
  r=StreamReducer('SYNTHETIC_ONLY',1_800_000_000);event={'message':{'id':'private-message-id','author':{'role':'user'},'create_time':1_800_000_000.125,'status':'finished_successfully','content':{'parts':['SYNTHETIC_ONLY']}},'conversation_id':'private-conversation-id','access_token':'NEVER_PUBLISH','account':{'created_at':1_800_000_000},'irrelevant':'NEVER_PUBLISH_BODY'};s='data: '+json.dumps(event)+'\n\n'
  for i in range(0,len(s),7):r.feed(s[i:i+7])
  public=json.dumps(r.public());self.assertNotIn('private-message-id',public);self.assertNotIn('private-conversation-id',public);self.assertNotIn('NEVER',public);self.assertNotIn('account',public);self.assertTrue(r.messages[0]['ownSyntheticMarker']);self.assertEqual(r.messages[0]['privateTimes']['create_time'],1_800_000_000.125)
 def test_assistant_not_user_send_time(self):
  r=reduce_event({'message':{'author':{'role':'assistant'},'create_time':1_800_000_000,'content':{'parts':['answer']}}},'SYNTHETIC',1_800_000_000);self.assertEqual(r['privateMessages'][0]['role'],'assistant');self.assertFalse(r['privateMessages'][0]['ownSyntheticMarker'])
 def test_http_or_browser_time_not_promoted(self):
  r=reduce_event({'response_time':1_800_000_000,'observed_at':1_800_000_000,'http_date':'synthetic'},'SYNTHETIC',1_800_000_000);self.assertEqual(r['privateMessages'],[])
 def test_bounded_incomplete_frame(self):
  r=StreamReducer('SYNTHETIC',0);r.feed('x'*65537);self.assertEqual(r.pending,'');self.assertEqual(r.discarded,1)
if __name__=='__main__':unittest.main()
