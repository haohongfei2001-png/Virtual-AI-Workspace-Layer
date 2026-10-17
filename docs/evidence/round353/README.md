# Round353：首次发送与失败终态的局部idle检查

接续1fcaac6。first-send只有未stop且pending/inflight/early均空时isIdle=true；浏览器事件先到的early不能被漏掉，proof/epoch/departure索引不永久阻塞。没有增加prune/时钟读取/预算续期。原observe在任何异步回调前登记inflight，未改顺序。

old-send-terminal同步登记intent/intentAccepted/observe入口访问计数，return await/finally覆盖空表的异步等待。rows/events/accepted/waiters/queued及访问计数任一存在都不idle；invalidate清表但旧queued读取未结束仍拒绝。原30秒关联、6秒等待、3次read/共享预算、used去重全部保留。残留关联保守false，不为了休眠删除它们。

新增first-send8项与old-terminal6项，最终发送/ACK/绑定/UI owner相关21文件285/285 Node PASS，无skip/cancel。独立审查无阻断。未运行浏览器。三个发送owner的局部predicate现均具备，但没有被当成自动休眠许可：总服务入口、人工UI操作、同producer冻结及同步复核仍待接线；完整自然休眠、Free/100k/真实profile等未通过，NOT_RELEASE_READY。
