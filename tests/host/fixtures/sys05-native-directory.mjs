// Application-owned lazy directory. Only the native server creates these rows.
if(location.pathname==='/c/44444444-4444-4444-8444-444444444444'){
 const button=document.createElement('button');button.type='button';button.id='sys05-load-directory';button.textContent='Load native directory';
 document.querySelector('#composer').before(button);
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;
  const response=await fetch('/native/sys05/load-directory',{method:'POST'});
  if(!response.ok)throw Error('sys05-native-directory-failed');
  const value=await response.json(),fragment=document.createDocumentFragment();
  for(const item of value.items){const link=document.createElement('a');link.href='/c/'+item.id;link.textContent=item.title;fragment.append(link);}
  document.querySelector('aside nav[aria-label="Chat history"]').append(fragment);button.dataset.applied='true';
 };
}
