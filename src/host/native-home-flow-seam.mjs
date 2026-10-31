// Package-declared nested home layout only. The native form's containing
// island remains intact; this resolves presentation members, never authority.
export function nestedHomeFlowSeam({document:doc,reading,composer,isOwnedSurface=()=>false}){
 try{
  const win=doc.defaultView,style=n=>win.getComputedStyle(n),children=n=>{if(n.children.length>16)throw Error('home-corridor-capacity');return [...n.children].filter(c=>!isOwnedSurface(c));};
  const plain=n=>n?.tagName==='DIV'&&!n.shadowRoot&&!n.matches('[role],[tabindex],[contenteditable],[inert],[hidden],[aria-hidden="true"]');
  const contents=n=>plain(n)&&style(n).display==='contents';
  if(!reading?.isConnected||!composer?.isConnected||composer.tagName!=='FORM'||reading.contains(composer)||composer.contains(reading))return null;
  const main=reading.closest('main [data-app-shell-main-content-layout] [role="main"]');
  if(!main?.contains(composer))return null;
  // This exact main -> native contents -> common box relation was observed.
  // Do not widen to arbitrary ancestors or flatten the native scroll region.
  const outer=children(main);if(outer.length!==1||!contents(outer[0]))return null;
  const roots=children(outer[0]);if(roots.length!==1)return null;
  const root=roots[0];if(!plain(root)||!root.contains(reading)||!root.contains(composer))return null;
  const rs=style(root);if(rs.display!=='flex'||rs.flexDirection!=='column'||!['static','relative'].includes(rs.position))return null;
  const inner=children(root);if(inner.length!==1||!contents(inner[0]))return null;
  const corridor=inner[0],parts=children(corridor);if(parts.length!==2)return null;
  const readingPart=parts.find(n=>n===reading||n.contains(reading)),band=parts.find(n=>n.contains(composer));
  if(!readingPart||!band||readingPart===band||!plain(band))return null;
  let node=readingPart,depth=0;
  while(node!==reading){if(++depth>16||!contents(node))return null;const next=children(node);if(next.length!==1)return null;node=next[0];}
  const bs=style(band);if(bs.display!=='flex'||bs.flexDirection!=='column'||!['static','relative'].includes(bs.position)||band.children.length>16)return null;
  let member=composer;depth=0;
  while(member.parentElement!==band){if(++depth>32||!member.parentElement||member.parentElement===root)return null;member=member.parentElement;}
  if(member===composer||!plain(member))return null;
  const ms=style(member);
  if(!['block','flex'].includes(ms.display)||!['static','relative'].includes(ms.position)||ms.transform!=='none')return null;
  return {root,band,composerMember:member,externalSeam:[{node:main,parent:main.parentElement,child:outer[0],contents:false},{node:outer[0],parent:main,child:root,contents:true}]};
 }catch{return null;}
}
