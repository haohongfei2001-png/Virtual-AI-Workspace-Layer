# R0 访客真实宿主断点

基线 PR #13 f151fb4e843f5fda7b9eab972aae11385a5d4947。独立 worktree `/Users/hhf/Documents/Codex/VAIWL-Development/r0-live-20261012`，分支 `codex/vaiwl-r0-live-readonly-20261012`，stacked Draft PR #14，base 为 #13 分支。既有 c1/main 和历史 PR 保持不变。

首次交付40f547a已普通非强制HTTPS推送。本阶段新增实际三轮访客消息、原始消息时间结构、真实MV3探针/worker停止事件与新boot、原生节点保护、工具/模型菜单、窄屏与深色截图、背景与freeze/resume。原首轮8 PASS / 2 FAIL保持原件；刷新丢失访客会话为真实原生限制（刷新前已卸载探针），其后Back恢复断言为连带失败。补测6 PASS只验证菜单、生命周期及限制观测，不覆盖或重标原失败。没有追加发送，不需登录。

探针原有broker拒绝未知scope，未打开数据库、未访问派生内容、未创建第二导航。实验只读代码与测试独立于正式src/simulator。工具观察器旧100ms等待不足、model为role=button SPAN、旧消息选择器漏匹配均属于驱动缺口；已最小修复并保留精确执行版本。未来重跑发送型测试必须使用另一个新专用profile，不能复用任意日常调试端口。当前guest窗口最终关闭由拥有者控制，后续最终记录在REPORT.md。

剩余裁决：原始发送时间/覆盖UNKNOWN，可信账户identity、持久历史、Project、A/B和官方clean导出需要未来统一清洁账户范围；PAIA NOT_RUN/WAITING_AUTHORIZATION。本轮继续完成报告、完整哈希和远端核对，不进入正式C2/真实派生导航。
