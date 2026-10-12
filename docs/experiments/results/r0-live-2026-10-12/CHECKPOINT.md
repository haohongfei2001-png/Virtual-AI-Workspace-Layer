# 原R0当前断点：真实匿名宿主

按用户后续修订，登录不是访客验证前置。实验分支codex/vaiwl-r0-live-readonly-20261012，独立worktree r0-live-20261012，base为实时PR #13 f151fb4。已验收c1工作树/分支与main不修改。

真实Google Chrome154全新Profile，标准原生启动+自己的新CDP、既有系统loopback代理，没有stealth或证书/安全绕过。旧Playwright默认启动连接关闭反例保留；标准原生Chrome实测HTTP200。尚不能归因到某一个默认flag。

原生基线已实际查看访客截图：中文，textarea而非旧#prompt-textarea，侧栏新聊天/图像/插件/深度研究/设置，登录和免费注册可见。没有Project或历史列表。不加载VAIWL。

按额外授权已经真实发送 **1条**无私人数据数学合成消息，真实回复5可见约4417.4ms。访客DOM采用data-message-role（LI）和data-user-message-copy，而非旧data-message-author-role；现有观察器选择器漏匹配已作为原件保留，下一步最小兼容观察器。没有使用内部API或账户数据；role不等于可信账户身份。

消息节点尚未观察到原始时间字段。记录的UTC时刻只是浏览器观测，不作为UserSendEvent.sentAt；coverage UNKNOWN。下一步：同一隔离窗口补最多两条合成多轮、重复DOM时间结构、真实路由/刷新、响应式/模型与工具原生菜单，再安装只读实验probe验证真实MV3通信/worker/停止/不替换原生节点。所有敏感派生访问继续fail-closed，不构造合成身份或第二导航。

R0-01账户身份/A-B、R0-03跨Project、正式历史/导出需要未来统一登录范围；PAIA NOT_RUN/WAITING_AUTHORIZATION。不能把本访客基线称为C2生产兼容完成。当前阶段仅R0-00/02/04访客增量正在执行。
