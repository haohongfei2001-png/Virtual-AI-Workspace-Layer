# Round344：拒绝异步准备跨越已撤销的选择 epoch

基线838961a；正式分支fetch确认本地/origin为0/0，整理stash42c8877及副本保留。

独立事件反例：A已prepared，B的getFrame尚未返回，A失败撤销document epoch；旧实现随后将B的epoch覆盖为当前值，直接complete或再经exact commit均会恢复receipt。独立测试旧代码2 PASS / 2 FAIL；原始结果见pending-epoch-red.tap.gz。

修复在prepared异步回调改变任何状态前核验request/document epoch一致。合法commit/history保留仍由原路径显式更新epoch；不延长6秒、不生成新认证来源。首次同context并发至少首个完成、失败后真正新请求可恢复。

定向17文件291/291 PASS，无跳过/取消，见context-green.tap.gz，涵盖新反例、现有commit/history顺序、context续期和scope授权。此轮为Node模型验证，不是新的MV3或真实账户成绩；未重复完整6655套或规模浏览器。

100k完整库存、静默context来源、其余81/profile/J1–J4及G/U仍开放，Free NOT_RELEASE_READY。遮罩下尚未观察成员不能据根mask信任提升为PROJECT，继续保持UNKNOWN。

生产文件SHA256：`4efc88d665a39cc4d22df2c66ff29486ff9fea280d9ee23d1c3f029515b5c50c`
