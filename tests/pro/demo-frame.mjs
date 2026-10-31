import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {createProWorkspace,createProSidebar} from '../../src/pro/ui/workspace.mjs';
import {mountFixtureNativeView} from './support/native-renderer.mjs';
import {runContinuousJourney} from './support/continuous-journey.mjs';
const databaseName=new URL(location.href).searchParams.get('db')??'vaiwl_pro_r1_demo';
if(!/^[A-Za-z0-9_-]{1,100}$/.test(databaseName))throw Error('invalid-fixture-database');
const owner=await createFixtureOwner({indexedDB,databaseName,fixtureOnly:true});
// A process reopening existing data must not silently recreate processing consent.
if((await owner.raw()).sequence>0)await owner.restart();
let nativeWorkspace;
const controller=await createProController(owner,{mountNativeView:(root,c,options)=>(nativeWorkspace=mountFixtureNativeView(root,c,{...options,owner}))});
const workspace=createProWorkspace(document.querySelector('#workspace'),controller);
const sidebar=createProSidebar(document.querySelector('#pro-sidebar'),controller);
const nativeSidebar=mountFixtureNativeView(document.querySelector('#native-sidebar'),controller,{role:'sidebar',owner,onPresentationRequest:async intent=>{await controller.setMode('native');await workspace.render();nativeWorkspace.present(intent);}});
const update=()=>{const view=controller.getView();if(view)nativeSidebar.update(view.native);else nativeSidebar.stop();};controller.subscribe(update);update();
window.proFixture={owner,controller,workspace,sidebar,databaseName,runJourney:()=>runContinuousJourney(owner,controller)};
await document.fonts.ready;window.proReady=true;
