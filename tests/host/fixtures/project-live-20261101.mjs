import {observedProjectHTML} from './observed-project.mjs';

// Only anonymous relationships/rectangles from PR16 comment 6546112515 are
// reproduced. This is NOT the uncollected ancestor tree or a live-page oracle.
export const projectLiveEvidence=Object.freeze({
 source:'https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6546112515',
 viewport:{width:1128,height:958},
 boxes:{main:[240.5,52,887.5,890],composer:[368.25,132,632,52],header:[0,0,1128,52],hitRoot:[240.5,0,887.5,958],panel:[368.25,252,632,134.6875],slot:[240,0,888,52],tabs:[368.25,208,132,36]},
 unknown:['complete-ancestor-tree','scroll-owner-and-overflow','clip-and-effects','native-controls-and-paint','header-transparency','composer-style','sidebar-structure'],
 privateContent:false,
});
export const projectLiveHTML=(project,cid)=>observedProjectHTML(project,cid)
 .replaceAll('340.5px','240.5px').replaceAll('340px','240px')
 .replace('<button>Native Project</button>','<button><span>Native Project</span></button>')
 .replace('href="/c/44444444-4444-4444-8444-444444444444"',`href="/g/${project}/c/44444444-4444-4444-8444-444444444444"`)+`<style>
[data-app-shell-main-titlebar]{margin-left:240px;width:calc(100% - 240px)}
[data-app-shell-main-content-layout]{left:240.5px;width:calc(100% - 240.5px)}
main[data-app-shell-main-surface]{left:240px;width:calc(100% - 240px)}
#project-content{max-width:632px;margin-inline:auto;padding:20px 0;gap:24px}
#project-title{height:36px;align-items:center}h1{margin-left:42px}
h1>button{height:31.1953125px;width:146.203125px;padding:0}
#project-tabs{width:132px}#project-panel{min-height:0}
li{height:67.84375px;box-sizing:border-box;padding:12px}li:last-child{height:66.84375px}
li>a{flex:none;width:534.8203125px;height:42.84375px}
li>a>div>div{height:21.421875px}li:first-child>a>div{width:202.8125px}
</style>`;
