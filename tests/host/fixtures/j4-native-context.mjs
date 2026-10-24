// Native application-owned context menu. No extension messages or expected world.
import '/variants-native.mjs';
const dialog=document.querySelector('#native-dialog');
for(const [id,label] of [['account-host-personal','Switch to Personal'],['account-host-team','Switch to Team']]){
 const button=document.createElement('button');button.type='button';button.textContent=label;
 button.addEventListener('click',async()=>{const response=await fetch('/native/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_id:id})});if(response.ok)location.reload();});dialog.append(button);
}
