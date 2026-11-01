# Round348：无 worker debugger 的自然 idle 观察

基线 eb3fe72；fetch 成功，本地领先远端 1、落后 0，72ca068 已是祖先。已有 LEGACY/MODERN disable/uninstall 开关矩阵无新缺口，不重复执行。

新增 raw CDP 隔离 headless Chrome 观察，不使用 Playwright 自动附加。初始化双 surface 后保留原生本地草稿并返回阅读，detach host page；60 秒期间只接收 Target discovery 事件，不发 page/worker 命令，不强停、不冻结、不改生产 timer。所有 extension targets 初始未附加，事件窗口检查未附加。全局 disposable reject proxy 保留，页面外网拒绝已实测；未向 worker 发外网探针。

实际 elapsed 60002ms、exit2：原 worker 未销毁，naturalWorkerSleep=NOT_ESTABLISHED。原 document/editor、草稿、两个原 iframe 均保留，popover=0、返回入口=1；native actions 为空，源码/构建/执行 runner 无漂移，cleanup 无错误。保存完整报告、日志和实际执行 runner。

这不是 UI-11 恢复通过，也不把 60 秒视为浏览器休眠保证。生产 frame/client 和 surface controller 仍有周期续租；需要另行解决安全闲置授权与恢复，不能通过删安全检查伪造休眠。审查指出 targetDestroyed 也可能是 crash；最终 runner 将任何未来销毁保守标为 UNFORCED_TARGET_DESTRUCTION_RECOVERY_NOT_TESTED，保留 crash 事件且 naturalWorkerSleep 仍 NOT_ESTABLISHED。此次没有原 worker 销毁，因此不重复浏览器；最终语法检查通过。

正常推送 eb3fe72 在 75029ms 后终端退出128：无法连接 github.com:443；尝试终止时进程已经结束。后续再正常同步，不强推。原 stash/副本均保留。完整 Free、100k、cold context、其余 81/J1–J4/G/U 仍未通过，NOT_RELEASE_READY。
