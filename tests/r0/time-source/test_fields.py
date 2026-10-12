import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'experiments/r0/time-source'))
from fields import StreamReducer,ScalarJSONReducer,reduce_event
class Fields(unittest.TestCase):
 def test_fragmented_event_selectivity(self):
  r=StreamReducer('SYNTHETIC_ONLY',1_800_000_000);event={'message':{'id':'private-message-id','author':{'role':'user'},'create_time':1_800_000_000.125,'status':'finished_successfully','content':{'parts':['SYNTHETIC_ONLY']}},'conversation_id':'private-conversation-id','access_token':'NEVER_PUBLISH','account':{'created_at':1_800_000_000},'irrelevant':'NEVER_PUBLISH_BODY'};s='data: '+json.dumps(event)+'\n\n'
  for i in range(0,len(s),7):r.feed(s[i:i+7])
  public=json.dumps(r.public());self.assertNotIn('private-message-id',public);self.assertNotIn('private-conversation-id',public);self.assertNotIn('NEVER',public);self.assertNotIn('account',public);self.assertTrue(r.messages[0]['ownSyntheticMarker']);self.assertEqual(r.messages[0]['privateTimes']['create_time'],1_800_000_000.125)
 def test_assistant_not_user_send_time(self):
  r=reduce_event({'message':{'author':{'role':'assistant'},'create_time':1_800_000_000,'content':{'parts':['answer']}}},'SYNTHETIC',1_800_000_000);self.assertEqual(r['privateMessages'][0]['role'],'assistant');self.assertFalse(r['privateMessages'][0]['ownSyntheticMarker'])
 def test_http_or_browser_time_not_promoted(self):
  r=reduce_event({'response_time':1_800_000_000,'observed_at':1_800_000_000,'http_date':'synthetic'},'SYNTHETIC',1_800_000_000);self.assertEqual(r['privateMessages'],[])
 def test_presentation_is_not_sent_at(self):
  r=reduce_event({'presentation':{},'hasStartedPresentation':True},'SYNTHETIC',0);self.assertEqual(r['fields'],[])
 def test_ndjson_message_fields(self):
  r=StreamReducer('SYNTHETIC',1_800_000_000);r.feed(json.dumps({'message':{'author':{'role':'user'},'create_time':1_800_000_000,'content':{'parts':['SYNTHETIC']}}})+'\n');self.assertEqual(r.frames,1);self.assertEqual(r.messages[0]['privateTimes']['create_time'],1_800_000_000)
 def test_embedded_native_html_is_reduced(self):
  r=StreamReducer('SYNTHETIC_ONLY',0);r.feed(json.dumps({'html':'<li data-message-role="user" id="never-publish-id"><p>SYNTHETIC_ONLY</p></li>'})+'\n');p=r.public();self.assertTrue(p['embeddedHTML']['roleGroups'][0]['ownSyntheticMarker']);self.assertNotIn('never-publish-id',json.dumps(p));self.assertNotIn('<li',json.dumps(p))
 def test_partial_json_never_exports_token_or_id(self):
  r=ScalarJSONReducer('SYNTHETIC',0);r.feed('{"access_token":"NEVER","id":"PRIVATE","create_time":1800000000,"role":"user"}');s=json.dumps(r.public());self.assertNotIn('NEVER',s);self.assertNotIn('PRIVATE',s);self.assertEqual(r.public()['messageAssociation'],'NOT_ESTABLISHED')
 def test_bounded_incomplete_frame(self):
  r=StreamReducer('SYNTHETIC',0);r.feed('x'*65537);self.assertEqual(r.pending,'');self.assertEqual(r.discarded,1)
if __name__=='__main__':unittest.main()
