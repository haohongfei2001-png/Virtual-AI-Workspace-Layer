# Round372：实际缺ACK关闭与显式重建

从 d61bf88 继续，产品源码未修改。新 incomplete-ack-recovery-mv3 runner沿用独立headless Chrome Profile、loopback认证fixture与外网阻断。

临时unpacked包仅两处明确测试插桩：content-entry暴露isolated session的boolean readiness/enterDormant/showReading interruption；ui-frame-client只抑制sidebar那条VAIWL_UI_IDLE_ACK并在旧frame记计数，其清空renderer/等待已开始render/最终清空root及wake listener全部保留。逐文件hash验证仅这两处不同，原archive不含补丁。第一次进入关闭后，同一调用中的showReading通过真实session同步工作计数废止关闭凭据；不是模拟原生send，不称实际rawIPC/adapter pending覆盖。

一次实际连续运行 **4项子检查PASS**：
- 原产品6秒关闭等待后返回false（实测6002.645ms）；两frame rootChildren都0，sidebar抑制计数1、workspace0；旧frame仍connected，open0/唯一四格，无自动rebind。
- 第一次真实Input四格点击后旧frame均disconnected且恰好两块新frame，fresh reading open0/唯一四格，原document/editor/草稿保留。
- 第二次真实Input明确点击后同一组新frame打开双surface，原editor/草稿保留。
- 新workspace/sidebar实际Shadow DOM均显示Research，nativeActions为空。source/runner/manifest运行中无漂移。

frame清空计数在关闭结算后、旧frame销毁前只读采样；worker从未被debugger附着，无stop/terminate、无改产品计时器/期限。此故障未释放idle mount成功，也没有自然worker退出观察窗口；report naturalWorkerObservation=NOT_RUN，naturalWorkerSleep=NOT_ESTABLISHED只是继承的未建立值，不能计自然退出成绩。

证据 **S_INSTRUMENTED_MV3_INCOMPLETE_ACK_RECOVERY / LEGACY_OFFLINE**，exit2保留未接受边界。产品前一轮7121完整回归不加算为本轮新成绩；本轮只新增runner并node --check，未重跑无关Node。运行后仅更正runner注释和插桩说明，executed-runner.mjs.gz保留当次逐字节版本/runnerHash，逻辑未改。

不认证真实raw发送在途/账户变化故障的S（对应L见Round371）、生产自动关闭、休眠首发、完整UI-11/81/G/U。Free仍NOT_RELEASE_READY。
