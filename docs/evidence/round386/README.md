# Round386 — busy关闭取消并重取UI授权

基于 Round385 7d07f37880bf798b32e2310dc0067452c10df934。PR16仍为原Free分支，base未变；整理stash与未跟踪副本保留。

## 实际变更

最终release明确返回ui-release-busy后，沿原6秒预算执行既有单次同producer续租，成功后取消本次休眠。保留mount、frames、adapter和producer；WAKE要求新JOIN/CONFIRM，双grant之前不能显示或focus。恢复默认reading，原生弹层优先。不引入任意30秒hold或持续closed续租。

取消开始不代表恢复完成。content保留busyClose，直到controller实际双grant授权后才清除；等待期间显式wake、同URL rebind、到期自动恢复均不能新HELLO。弹层导致waiting变suspended也必须正确完成双grant通知。

## 验证与限制

新增独立controller测试先8红（缺API），最终针对性60项L通过。含原producer/frames保持、新双JOIN前拒绝授权、重复取消、无busy/未续租/续租失败/过期/路由/frame/stop反例；content覆盖取消成功、续租失败、取消失败和到期回调不HELLO。独立审查发现并修正提前解除busy和原生弹层阻断完成通知两个窗口。

冻结源码后完整Node **7261/7261 PASS**，0 skip，exit 0。日志随本目录保存。

本轮无新S，不认证实际MV3 busy race闭环。租约过期仍执行既有stop/revoke，不能宣称此失败路径保留observer或pending；未知release结果、取消恢复失败后的可用返回、自动休眠仍开放。100k原FAIL、81项剩余与真实G/U条件保持。Free NOT_RELEASE_READY。
