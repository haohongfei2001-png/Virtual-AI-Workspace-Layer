import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCriticalLayout,validateActiveLayout,activeLayoutFailureReasons} from '../../src/host/document-flow-layout.mjs';
import {validLayoutShape} from '../../src/host/local-status.mjs';

test('refusal diagnostics cannot turn a failed layout into acceptance or expose exception text',()=>{
 const reasons=[];
 const document={defaultView:{}};
 assert.equal(validateCriticalLayout({document},{onRefused:r=>reasons.push(r)}),false);
 assert.deepEqual(reasons,['structure']);
 assert.equal(validateCriticalLayout({document},{onRefused(){throw Error('PRIVATE');}}),false);
 assert.equal(validateActiveLayout(null,{onRefused:r=>reasons.push(r)}),false);
 assert.deepEqual(reasons,['structure','exception']);
});

test('existing private status accepts only fixed layout refusal codes and preserves the presentation contract',()=>{
 const navigation={phase:'accepted',roots:[1,1,0],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:0,visible:0,titles:0,association:0,candidates:0,claims:0};
 const delivery={pages:3,resolvedProjects:0,resolvedChats:4,acceptedPackets:2,acceptedProjects:0,acceptedChats:4,rejectedPackets:0,capped:false};
 const presentation={mode:'reading',desiredMode:'workspace',transitions:[],attempt:'show-refused',registered:true,frames:2,grants:2,workspace:false,sidebar:true,geometryPaused:false,returnPresent:true};
 const shape=p=>({navigation,delivery,presentation:p});
 assert(validLayoutShape(shape(presentation)));
 for(const layoutRefusal of [null,...activeLayoutFailureReasons])assert(validLayoutShape(shape({...presentation,layoutRefusal})));
 for(const layoutRefusal of ['PRIVATE','control-hit:private',{},0,undefined])assert(!validLayoutShape(shape({...presentation,layoutRefusal})));
 assert(!validLayoutShape(shape({...presentation,layoutRefusal:'control-hit',privateBody:'PRIVATE'})));
 assert(!validLayoutShape(shape({...presentation,layoutRefusal:'control-hit',grants:3})));
 const geometry=[240,50,800,500,500,200,40,40,2,0,0];
 assert(validLayoutShape(shape({...presentation,layoutRefusal:'control-overlap',layoutGeometry:geometry})));
 for(const layoutGeometry of [['PRIVATE'],[...geometry,1],geometry.map(()=>NaN),[...geometry.slice(0,8),4,0,0]])assert(!validLayoutShape(shape({...presentation,layoutRefusal:'control-overlap',layoutGeometry})));
 assert(!validLayoutShape(shape({...presentation,layoutRefusal:'control-hit',layoutGeometry:geometry})));
 const sparse=Array(11);sparse[8]=2;
 const extra=[...geometry];extra.private='PRIVATE';
 const getter=[...geometry];Object.defineProperty(getter,'0',{get(){throw Error('must not read getter');}});
 for(const layoutGeometry of [sparse,extra,getter,[240,50,-1,500,500,200,40,40,2,0,0]])assert(!validLayoutShape(shape({...presentation,layoutRefusal:'control-overlap',layoutGeometry})));


});
