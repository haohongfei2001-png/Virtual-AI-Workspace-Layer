# Round384 — 清理界面前的 worker 空闲预检

原关闭流程在 worker 判定 busy 前已清 UI grants、取消续租。新增私有 HOST_UI_IDLE_CHECK：由既有实际 parent/browser/scope/mount/binding 与 worker 全owner空闲guard核验，成功只读、不撤销grant/port、不形成后续释放许可。controller.checkIdle等待期间不清frame、不中断续租；content.enterDormant在首次清理前必须预检通过，已双ACK的显式重试仍由最终release判断。预检和双frame清理/最终释放共用原6秒elapsed预算，任何新工作仍干扰关闭，最终release再次核验。

## 验证边界

- 针对性 **95/95 L PASS**。实际service/UI owner+MockIDB验证预检读后grant/port可用，preflight后新工作仍阻止release，伪造请求不影响原mount；controller拒绝/迟到scope/guard/visible/route/stop保持原timers与UI，成功预检仍不跳过双ACK；content忙/空回复不清理，原deadline拒绝迟到响应。
- 新owner测试在生产改动后运行为3/3绿，不是红测证据。
- 浏览器初版单次close返回false，保留原日志/report/runner。runner调整为既定六秒窗口内有界显式重试，不强制idle、不取消pending任务、不延长产品deadline。
- 独立四文件审查无新增阻断。

## 仍未启用自动休眠

预检通过后新任务出现、最终release拒绝时的lease维持尚未闭合；草稿/运行态风险门槛也仍需处理。因此没有接上定时自动enterDormant，没有声称UI11或自动休眠完成。此改动已接入真实显式关闭流程，先解决worker已忙时仍提前清理的缺口。

100k原FAIL、即时首发及其余81/G/U继续开放，Free **NOT_RELEASE_READY**。

实际最终隔离MV3：**3项S子检查PASS**，`UNFORCED_WORKER_DESTRUCTION_AND_WAKE_OBSERVED`，约定exit2（partial acceptance）。最终本次closeAttempts仅一次且成功；原单次false原因未由报告精确归因，不声称必然某类pending。双实际frame ACK/worker release成功，60秒无worker debugger观察窗内旧worker销毁，唯一原生返回后fresh worker/views恢复，原frame/editor/草稿保持。source/runner/manifest稳定，清理成功。runner未提供fixture全hash结论；仍标naturalWorkerSleep NOT_ESTABLISHED，不把显式插桩close误作自动休眠或完整UI11。

最终完整 Node **7232/7232 PASS**，0 skipped、exit0。
