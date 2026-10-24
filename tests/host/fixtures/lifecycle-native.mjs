// Fictional native application UI; no extension messages or grants.
const dialog=document.querySelector('#native-dialog'),status=document.createElement('output');status.id='lifecycle-status';dialog.append(status);
const deletionDialog=document.createElement('dialog');deletionDialog.id='lifecycle-delete-dialog';
const title=document.createElement('p');title.textContent='Delete ordinary conversation?';deletionDialog.append(title);document.body.append(deletionDialog);
const open=document.createElement('button');open.type='button';open.textContent='Delete conversation';open.addEventListener('click',()=>{dialog.close();deletionDialog.showModal();});dialog.append(open);
for(const [operation,label]of [['cancel','Cancel deletion'],['http-only','HTTP-only result'],['wrong-target','Wrong target result'],['delete','Confirm deletion'],['restore','Confirm restoration']]){
 const button=document.createElement('button');button.type='button';button.textContent=label;
 const owner=operation==='cancel'||operation==='delete'?deletionDialog:dialog;
 button.addEventListener('click',async()=>{button.disabled=true;const request=fetch('/native/lifecycle/action/'+operation,{method:'POST'});owner.close();const response=await request;status.value=response.ok?operation:'failed';});owner.append(button);
}
const stale=document.createElement('button');stale.type='button';stale.textContent='Observe stale title';
stale.addEventListener('click',()=>{document.querySelector('aside nav[aria-label="Chat history"] a[href="/c/33333333-3333-4333-8333-333333333333"]').textContent='Stale retained native title';dialog.close();});dialog.append(stale);
