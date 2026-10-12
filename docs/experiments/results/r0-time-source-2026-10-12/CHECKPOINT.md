# PR #14 匿名时间来源专项断点

本worktree `/Users/hhf/Documents/Codex/VAIWL-Development/r0-live-20261012`，分支 `codex/vaiwl-r0-live-readonly-20261012`。基线a68fd07；实验驱动初版bf6bbd7。正式src/simulator/design未修改。

四批真实浏览器：run-1三条件6条消息、run-2 NDJSON类型修复后2条、run-3网络连接关闭0条、run-4嵌入结构归约1条，合计9条，四个专用Chrome均由拥有者关闭。前三批的弱Back PASS未重写；最新检查要求DOM与路由同时匹配，实际旧DOM可见但路由不同，恢复仍不成立。三个独立刷新均丢失消息。原文件、精确执行源码及hash均保存。

网络确为第一方自然产生的application/vnd.openai.conversation-source+ndjson。两批共三个流各14帧；只逐帧归约必要元字段，未存完整请求响应/HAR/认证信息。见SUMMARY.json和最终REPORT.md；originalUserSentAt与覆盖UNKNOWN，不判所有匿名渠道不可能。

执行控制缺陷：最初声明六条上限，原代码按每次运行计数，导致总共9条。追加第10条被自动审批拒绝，未启动该浏览器、未发送。已改为专项跨run累计默认六条，在新Profile创建前拒绝；离线验证通过。仅准备了RAM内ID相等比对提案，实测未运行。若以后确需补该项，须新明确批准额外一条；不利用新目录/新Profile重置任务预算或绕过审批。当前没有后台执行。
