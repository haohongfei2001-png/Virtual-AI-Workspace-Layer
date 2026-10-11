# B2/B3 最新恢复点

2026-10-11：PR #7 Mac 隔离 Chrome 增量完成，保持 Draft，base仍为PR #6，不合并、不开始B4/C1/C2。

- 初始head cd9066b；环境检查点1473af8；原生修复与39项IDB检查点36a5934；页面17项及最终驱动4b69501；MV3 19项检查点80feb36。最终文档提交以PR实时head为准。
- 真实Chrome154、macOS27、Node26.8.2、Python3.14.7、Playwright1.63；全部新Profile/headless/loopback/合成数据。正常URL和unpacked MV3实际可用，云端阻塞解除。
- 原生恢复缺陷已修复：index cursor.primaryKey使全部旧receipt失效；保留撤权首个失败原因。mock游标语义亦纠正。相关Node38/38通过，无skipped。
- 最终报告：B23_MAC_ACCEPTANCE_2026_10_11.md；逐项JSON、raw Chrome/CDP worker日志、失败原件、差异、截图、命令及SHA256在b23-mac-2026-10-11/。
- 最终3份原生报告的可执行源码哈希与最终源一致；后改README的运行时/最终文档哈希单列，构建哈希相同。恢复仍有损；不承诺自动UI重连或跨tab推送。真实ChatGPT身份/数据/权限接管仍有独立前置条件。
- 裁决：隔离合成宿主范围内工程验收通过；生产ChatGPT未运行/未放行。未读取日常Chrome、私人聊天、PAIA；main与其他PR未改，无付费服务或Actions。

之前云端历史原件仍在b23-final-2026-10-11/，不要把历史118/49与本轮39/17/19/38累加。
