# Round368：可信休眠返回补齐工作区进入通知

从 f1245c8 继续。独立审查发现普通可信四格返回会调用 workspaceEntered，但 dormant 恢复双 JOIN 后只显示工作区，未通知新 frame 启动进入校准。本轮在可信 dormant 点击保留一次 RAM 意图，待原 mount 的双新 grant 且实际打开 workspace 后消费并通知；程序调用 resume、非可信点击和初始打开不产生该事件。失败、原生输入或弹层取消意图，通知拒绝不撤销已显示界面。

独立反例先 8 项中 3 FAIL；修复后复核追加两个同步 showPopover 中断反例，均曾 FAIL。最终用预期 intentEpoch 与 native input/layer/protected focus 再核验，防止同步中断后局部标志误通知。两轮红测原件保留，独立最终复核无新增阻断。

验证：
- 最后同步中断护栏前完整 Node 7106/7106 PASS；不是最终源码的另一次完整成绩。
- 最终相关 170/170 PASS，覆盖新通知 10 项、历史恢复 4 项及关闭/恢复/历史回归。
- 历史恢复测试用 MockIDBFactory，只记 L：同一 repository 更换 owner/provider/reader 后旧 immutable event 保留，新认证原始发送恰好一次，重复读取不续 observedAt，旧迟到回包/旧私有授权/账户变更拒绝；无 hint/正文/凭证持久化。不冒充真实 IndexedDB 或 Chrome 重启。
- 最终源码实际隔离 headless MV3 一次运行 3 项子检查 PASS：真实双 ACK 关闭、60 秒无附着窗口中的原 worker 销毁、四格返回后新 worker 和双 frame 内容恢复，草稿/原节点保留。源码/runner/manifest 无漂移。沿用原单入口测试插桩，未改计时器或 worker；exit 2 与 naturalWorkerSleep NOT_ESTABLISHED 保留。

MV3 回归没有直接断言新增校准通知或历史事件落库，不能替代这条链的 S 验收。下一步是 J3 offlineHistory 在首次可信 dormant 返回后的真实只读 IDB oracle，不以第二次普通返回掩盖缺失。生产自动休眠、休眠后首发、完整 UI-11/81/G/U 仍未完成，Free NOT_RELEASE_READY。
