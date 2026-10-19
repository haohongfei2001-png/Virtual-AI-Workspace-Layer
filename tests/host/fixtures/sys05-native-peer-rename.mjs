// Native fixture control; the server owns the title. No extension/DB access.
if(location.pathname==='/c/33333333-3333-4333-8333-333333333333'){
 const button=document.createElement('button');button.type='button';button.id='sys05-peer-rename';button.textContent='Rename peer conversation';
 document.querySelector('#composer').before(button);
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;
  const response=await fetch('/native/sys05/rename-peer',{method:'POST'});
  if(!response.ok)throw Error('sys05-native-rename-failed');
  const value=await response.json();document.querySelector('h1').textContent=value.title;
  for(const link of document.querySelectorAll('aside a[href="/c/'+value.id+'"]'))link.textContent=value.title;
  button.dataset.applied='true';
 };
}
