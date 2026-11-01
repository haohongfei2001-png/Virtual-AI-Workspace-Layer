# Round359：content会话聚合真实在途工作

从dfd2853继续，正式分支/PR16/base及整理stash保持。content将全部runtime.sendMessage纳入工厂级原始IPC计数，rpc逻辑链、身份回复、候选排队/回复、native action、focus及完整renew链分别覆盖。reset/start不抹除旧会话仍未settle的任务。prepareIdle同时检查当前binding/route/epoch、发送观察及身份reader的可撤销快照、片段pending与未完成候选导航。

同步listener与公共show使用同步工作计数，避免内部回调重入取得新快照；依赖prepare/check前后复查revision，阻止同步变化被吸收。adapter实际dispatchNative也纳入真实任务计数，frame计划deadline先返回不掩盖底层authorization/action。原生监听/队列、授权、预算、导航单次派发均保持。

独立初始content13项在无API源失败，实施后通过；补充5项同步重入和1项adapter dispatch跨restart反例。独立审查推动同步重入修正。首次完整Node **6919 PASS / 2 FAIL（6921项）**，失败均J3诊断旧RPC精确锚点。更新至现有send调用，保留唯一匹配与RAM-only不包装Promise检查，相关106/106通过。最终27文件 **715/715 PASS**，零skip/cancel。各结果存在重叠，不相加为新全套；日志与源hash保留。

当前只是content局部聚合准备，不是跨进程原子关闭许可；自动调用controller dormant、frame清空ACK与fresh授权恢复未启用。原生用户发送在休眠后如何先保留意图再新授权仍须闭合，不能在可见阅读时停止observer或复用过期body proof。实际UI-11自然休眠/慢恢复及Free全验收未完成，无新MV3声明，NOT_RELEASE_READY。
