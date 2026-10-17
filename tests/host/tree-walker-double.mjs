/** Array-based DOM double only; actual traversal/bounds are browser-tested. */
export function installTreeWalkerDouble(document){
 const wrapped=new WeakSet();
 document.createTreeWalker=(root,what)=>{
  if(what!==1)throw Error('unexpected-tree-walker-filter');
  const nodes=[...root.querySelectorAll('a[href],button')];let index=0;
  return {nextNode(){const node=nodes[index++];if(!node)return null;
   if(wrapped.has(node))return node;wrapped.add(node);
   const original=node.matches?.bind(node);
   node.matches=selector=>selector==='a[href],button'?node.tagName==='BUTTON'||node.tagName==='A'&&node.getAttribute('href')!==null:selector==='a[href]'?node.tagName==='A'&&node.getAttribute('href')!==null:original?.(selector)??false;
   return node;
  }};
 };
}
