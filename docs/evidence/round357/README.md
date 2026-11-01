# Round357：保留发送监听的可撤销观察准备

从19d24ba继续；正式分支、PR16/base与整理stash保持。adapter新增私有prepareIdle观察快照，原生监听、发送队列和扫描均继续运行。pending emit、摄取start/end通知、重试、未排空surface/intent、挂起loaded iterator阻止准备；stop/start不清除尚未完成的异步计数。新输入、扫描、iterator、binding/generation/sequence变化使旧快照失效，不因队列后来排空复活。

它不是冻结或关闭许可，也没有接入自动休眠。首发异步回调仍需content实际IPC计数；content请求deadline/abort先返回后的底层任务、native dispatch和isolated identity读取同样须覆盖。现有frame待命消息派发不等于清空ACK。实际自然worker退出、慢恢复和完整UI-11仍未验收，不删除Round348自然休眠失败。

独立新增12项全部通过，包含prepare后真实send observer继续捕获并提交一次intent、跨restart迟到emit、双iterator关闭、摄取通知与重试。独立只读审查无阻断。诊断trace精确适配track/stop锚点，保留一次调用、晚ACK旧pass归属与唯一锚点校验，63项通过。最终完整Node **6898/6898 PASS**，零skip/cancel，exit0；日志与测试源hash保存在本目录。未新增浏览器/MV3通过声明；完整Free/100k/真实profile/G/U继续NOT_RELEASE_READY。
