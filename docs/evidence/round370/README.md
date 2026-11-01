# Round370：同步原生焦点优先于工作区显示提交

从 bc0d636 继续。独立审查确认 Round368 通知守卫之外仍有展示状态缺口：surface.showWorkspace 的两个 showPopover 可以同步触发原生 input/layer surrender；mount 循环随后可能打开另一面，controller 又无条件写 mode=workspace 并移除四格。

showWorkspace 现在在几何刷新前后及显示后核对同一 state/handle、intentEpoch 和授权。若显示被同步中断，仅关闭当前挂载的残留surface；原生输入回reading/唯一四格，弹层保持suspended。若state/handle已替换，直接拒绝旧尝试，不触碰新挂载。不dispose正常原frame、不补跳/重发、不重新打开覆盖原生动作。下一次明确点击仍能打开。

独立12项原4FAIL转绿，覆盖实际visible状态、模拟mount继续打开第二surface、sameframes/no disposal、输入返回与弹层消失后返回，以及同步stop/replacement不能报告旧成功或影响新入口。最终相关 **144/144 Node PASS**；无额外全套成绩。独立最终复核无新增阻断。

最终源码实际隔离headless MV3一次 **4项子检查PASS**：真实关闭/原worker无附着窗口销毁；首次可信四格返回期间，测试只添加一次owned beforetoggle(open)监听，先移除监听再调用原editor.focus，真实DOM焦点事件中断；结果hook命中1、editor active、open0/唯一返回、原frame/编辑器/草稿保留；第二次真实Input点击后open2、新worker和双frame Research内容恢复。nativeActions为空、源/runner/manifest无漂移。没有改原生handler/节点或派发伪focus事件。

证据 **S_INSTRUMENTED_MV3_WAKE_NATIVE_SURRENDER / LEGACY_OFFLINE**，临时包仍只有isolated session入口补丁；测试编排同步焦点不代表物理IME/全部原生弹层/真实ChatGPT。worker未附着或强停，target销毁原因仍naturalWorkerSleep NOT_ESTABLISHED，exit2保留。未直接浏览器测通知次数，通知反例由独立Node覆盖。UI-11全项、生产自动策略/首发、81/G/U与完整Free仍NOT_RELEASE_READY。
