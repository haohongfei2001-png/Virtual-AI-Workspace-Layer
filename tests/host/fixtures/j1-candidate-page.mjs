/** Application-owned J1 pagination surface, assembled before the page is served.
 * Pending controls expose no stable identity and are never activated by this test.
 * The only activated IDless control remains the original native Research button.
 */
export function j1CandidatePage(html){
 const target='<button class="project-entry">Research</button>';
 if(html.split(target).length!==2)throw Error('J1-native-target-not-unique');
 const pending=(start,end)=>Array.from({length:end-start+1},(_,offset)=>`<button type="button" data-j1-pending="${start+offset}">Pending project ${start+offset}</button>`).join('');
 return html.replace(target,pending(1,40)+target+pending(41,80)).replace('</head>',
  '<style>aside section[aria-label="Projects"]{height:180px;flex:0 0 180px;min-height:0;overflow:auto}</style></head>');
}
