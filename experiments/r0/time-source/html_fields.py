"""Incremental schema-only HTML reducer for native own-message NDJSON fragments."""
from html.parser import HTMLParser
import re
TIME=re.compile(r'(?:^|[_-])(?:create(?:d)?|sent|send|update(?:d)?|server|response|received|observed|start|end)?[_-]?(?:time|timestamp|at|datetime)$|^(?:createTime|createdAt|sentAt|sendTime|serverTime|timestamp|updateTime|datetime)$',re.I)
class HTMLFields(HTMLParser):
 def __init__(self,marker):super().__init__(convert_charrefs=True);self.marker=marker;self.roles=[];self.times=[];self.current=None;self.candidate='';self.tags=0
 def handle_starttag(self,tag,attrs):
  self.tags+=1;a=dict(attrs);role=a.get('data-message-role',a.get('data-message-author-role'))
  if role in ('user','assistant'):
   self.current={'path':'embedded-native-HTML','role':role,'ownSyntheticMarker':False,'privateId':a.get('data-message-id',a.get('id')),'privateTimes':{}};self.roles.append(self.current);self.candidate=''
  for name,v in attrs:
   if TIME.search(name):
    self.times.append({'field':name,'type':'HTML-attribute-string','associatedUserRole':self.current is not None and self.current['role']=='user'})
    if self.current:self.current['privateTimes'][name]=v
 def handle_data(self,text):
  if self.current and self.current['role']=='user':
   self.candidate=(self.candidate+text)[-512:]
   if self.marker in self.candidate:self.current['ownSyntheticMarker']=True
 def bounded_feed(self,text):
  self.feed(text)
  if len(self.rawdata)>65536:self.rawdata=''
 def public(self):return {'tagsScanned':self.tags,'timeAttributes':self.times[:100],'roleGroups':[{'role':m['role'],'ownSyntheticMarker':m['ownSyntheticMarker'],'idPresent':m['privateId'] is not None,'timeFieldNames':list(m['privateTimes'])} for m in self.roles[-30:]]}
