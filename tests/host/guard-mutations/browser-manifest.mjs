export const browserMutations=[
 {id:'auto-popover',spec:'UI-08',evidence:'S',file:'src/navigation/mount-surface.mjs',edits:[["node.setAttribute('popover','manual')","node.setAttribute('popover','auto')"]]},
 {id:'background-mask',spec:'UI-06',evidence:'S',file:'src/navigation/mount-surface.mjs',edits:[['[data-va-mask-${role}="${id}"]{visibility:hidden;interactivity:inert;}','[data-va-mask-${role}="${id}"]{}']]},
 {id:'async-default',spec:'UI-01',evidence:'S',file:'src/navigation/navigation.mjs',edits:[['      event.preventDefault();\n      const dto=','      /* MUTANT: asynchronous dispatch with uncancelled native default. */\n      const dto=']]},
 {id:'postcommit-window',spec:'SYS-01',evidence:'D',file:'src/data/native-repository.mjs',edits:[['...(continuation?{continuation}:{})','...({})'],['    const result=await apply();','    const result=await apply();\n    if(continuation&&result.ok){globalThis.__guardPostCommitCut?.();await new Promise(()=>{});}']]}
];
