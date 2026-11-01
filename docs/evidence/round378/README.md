# Round378：读取异常保留发送预算与防重放记录

基线 e157c60a164c65654e9b40ffe74b727ce64a22c1（Round377 已非强制同步并独立核对 PR16）。

独立反例证明 reader.read 抛错后原 owner 删除整个 entry，使同 proof 后续 observe 重置每秒/三次本地上限；已使用 intent ID 的 replay ledger 也丢失。原源红测 5 项 2 PASS/3 FAIL，日志保留。这是本地 owner 调用预算缺口；共享持久 GET 预算仍独立存在，不宣称网络上限被绕过。

修复复用既有有界 entry：错误退役时清待处理 ACK、重试 timer、baseline、proof 和 correlator pending，但保留 readProof/readAttempts/lastReadAt、binding、used ledger 及 clock。没有新增自动重试或账本存储；正常签名改变仍按原逻辑创建新 entry。correlator 的 invalidateBaseline 是纯 RAM 因果退役，不是授权续期。

独立审查指出 clock 回退会完整解绑，若直接保留 entry 可留下外层 ready/内部无绑定的僵尸状态。新增纯 RAM isBound 查询和 sealed 状态：观察/intent 错误、entryFor、idle、pendingIntent/settle 统一识别实际解绑并封存。正常 pending 的 idle=false 不封存；普通 terminalGuard 拒绝不会清有效 pending。时间恢复或仅换 proof 不复活，真实 producer/bodyEpoch 等签名改变才重建基线。封存态无 pending/timer，不永久阻塞 idle。

最终独立 **15/15 L PASS**，相关生产调用链 **210/210 PASS**，完整 Node **7184/7184 PASS**，零 skip/cancel；源码冻结、diff检查和独立审查通过。覆盖同刻重复、999/1000ms、三次限制、新 proof、单飞与撤销、旧 intent 不重放、新手势关联，以及五种 clock 入口各自的真实绑定恢复。

本轮只有 L，无新的 D/S/G/U；不把前轮 MV3 成绩提升为当前异常场景的实际浏览器认证。没有更改共享网络预算、DB/schema、原生发送或自动休眠策略。完整 UI11/81/100k/G/U 与 Free 仍 NOT_RELEASE_READY。
