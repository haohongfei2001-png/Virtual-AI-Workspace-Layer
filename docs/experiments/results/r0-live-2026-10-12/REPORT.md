# 真实 ChatGPT R0：获准匿名范围完成，整体 LIMITED

2026-10-12 Mac 本地真实官方站点验证。原任务书 `docs/experiments/R0_CAPABILITY_SPIKE.md` 的 R0-00–06 为依据；用户本轮修订允许访客发送少量合成消息、无需登录。原任务书及 STATUS 中较早的授权状态不替代本轮明确授权，产品目标与原路线不修改。

**结论：真实访客消息与最小只读 MV3 接入可行；正式 C2 私人派生工作区仍 BLOCKED。** 当前没有可信网页账户 witness、可靠原始用户发送时间、历史覆盖或跨 Project 证据。不会使用显示名、URL、测试 scope、浏览器时刻或访客短期会话弥补这些缺口。

## 精确基线与隔离

实时 PR #13 head `f151fb4e843f5fda7b9eab972aae11385a5d4947`；从该提交创建持久独立 worktree `/Users/hhf/Documents/Codex/VAIWL-Development/r0-live-20261012`，分支 `codex/vaiwl-r0-live-readonly-20261012`。

[Draft PR #14](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/14) stacked base 为 #13 分支 `codex/vaiwl-f1-performance-20261012`。阶段提交40f547a、dfa3c96已正常HTTPS非强推，实验代码和真实证据已远端持久化。最终报告随后提交；最新精确 head 从 PR 查询，避免报告自身 commit SHA 循环。没有修改 main 或 #5–13。

| 环境 | 实际值 |
|---|---|
| macOS | 27.0 / 26A428 |
| Google Chrome | 154.0.8037.99，官方安装 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Node | 26.8.2 |
| Python / Playwright | 3.14.7 / 1.63.0，复用 c1 隔离 venv |
| 宿主 | 官方 `https://chatgpt.com`，未登录、中文 Octane 属性变体 |
| Profile | 本轮新建私有目录的全新专用 Profile，未复制任何日常数据 |
| 窗口 | 可见 Chrome，1440×913 CSS 实际内容区；截图2880×1826；窄屏390×844 CSS，截图780×1688 |
| 深色 | CDP `prefers-color-scheme: dark`，没有操作网站/账户设置 |
| 实验权限 | `webNavigation`、`scripting`，仅 `https://chatgpt.com/*`；无 cookies/history/debugger/storage/all_urls |
| 关闭 | 实验 `stop()` 和真实 `Extensions.uninstall` 已执行；最后拥有者关闭本轮 Chrome，进程结束 |

脚本只连接本轮新 Profile 的 DevToolsActivePort，不搜寻/连接日常 Chrome。CDP 是本地测试驱动能力，不是扩展 debugger 权限。真实浏览器与官方站点是必要验证，未重复运行已验收合成工程。

## 网络原失败与驱动修复

`NETWORK_BEFORE.json` 保留原始错误类别/网络错误码与 HTTP 结果：Playwright 默认可见启动首次失败；使用既有系统 loopback proxy 后仍 `net::ERR_CONNECTION_CLOSED`；无显式 proxy 的 curl HEAD 超时，既有 proxy 的 HEAD 为403、TLS验证成功。使用标准原生 Chrome 子进程、全新 Profile、相同现成 proxy、再连接其专用 CDP 后真实站点 HTTP200。

不修改系统代理或安全策略，不忽略证书，不处理验证码，不添加 stealth/spoof 参数。**究竟哪个默认启动差异引发失败仍 NOT_PROVEN**；HTTP403的 HEAD 也不代表真实浏览器访问失败。不重复盲试相同环境。

## R0 能力覆盖矩阵

| 原 ID | 裁决 | 实际证据 | 不能由匿名结果替代的能力 |
|---|---|---|---|
| R0-00 真实宿主/原生功能 | LIMITED | 无扩展基线；三轮原生发送/真实回复/生成停止入口；native sidebar、model/tool popover、390窄屏/深色截图 | 账户/Project/持久搜索、真实登录后功能；分享/Canvas/完整四格返回插槽未认证 |
| R0-01 可信身份 | BLOCKED，账户项 NOT_RUN | 所有真实 probe BIND 均 `unverified-scope`；URL/标签不能授权；没有开数据库或敏感投影 | 网页账户/组织 witness、A→B→A；无第二账户/组织测试，不冒充隔离认证 |
| R0-02 历史/角色/时间 | LIMITED，originalUserSentAt / TimeCoverage UNKNOWN | 三个真实 user/assistant 配对，DOM角色可区分；每个用户节点及后代的原时间结构检查；刷新后原会话丢失 | 原始发送时间、分支/编辑归属、完整历史/新鲜度、正式导出覆盖均 BLOCKED/NOT_RUN |
| R0-03 跨 Project 导航 | BLOCKED / NOT_RUN | 当前访客侧栏0个可见聊天引用、0个Project引用，仅当前文档计数 | T0/P1T1/P2T2真实归属/上下文/权限与跨Project路由，无样本时不自动创建 |
| R0-04 原生DOM/扩展/生命周期 | LIMITED；列出的实验链 PASS | 实际MV3加载/content-worker通信；真实stopped事件/boot变化；native main/input/先前消息引用；后台hidden/visible、freeze/resume、草稿焦点、停止卸载 | 正式派生导航挂载/撤权/恢复、唯一阅读返回插槽、上传/IME/Canvas/未知原生新功能未运行，不复用合成结果称真实通过 |
| R0-05 PAIA | NOT_RUN / WAITING_AUTHORIZATION | 本轮未安装、访问或修改PAIA | 需要独立共存授权与确切构建，不把无PAIA称通过 |
| R0-06 最终准入 | LIMITED | 获准匿名范围闭环、原失败/截图/源码/构建hash持久化 | C2正式身份/时间/覆盖/slot准入仍BLOCKED，不启动生产接管 |

### 真实原生功能五格

| 功能 | 入口 | 过程 / 结果 | 状态与权限 | 返回 |
|---|---|---|---|---|
| 普通文本 | 原生TEXTAREA、发送按钮 | 真实三轮发送与回复，2+3→5、7+4→11、12行合成文本 | 未登录；停止生成入口在第三轮实际出现，但没有主动中止回复 | SPA路由发生变化；刷新丢失会话，Back不能恢复 |
| 模型入口 | `ChatGPT` role=button SPAN | 打开真实popover，实际显示登录/注册卡片 | 不切换模型、不触发付费请求 | Escape关闭，原输入/main引用保持 |
| 工具入口 | 原生“添加文件等”按钮 | 实际打开popover；图像/深度研究/文件明确“登录后使用” | 未上传、未调用工具；照片/网页搜索只观察入口 | Escape关闭，后台草稿/焦点另有证据 |
| 新聊天 | 原生侧栏链接 | 原首轮点击到无消息页面；Back恢复断言失败 | 不写历史、不改聊天 | 失败是刷新丢失访客会话后的连带限制，不声称独立成功 |
| 历史/搜索/Project | 本变体无获准可用样本/入口 | NOT_RUN | 登录依赖，不猜隐藏渠道 | NOT_RUN |
| 复制/分享、语音、附件、Canvas、原生菜单其他动作、物理IME | 部分入口可见 | 行为 NOT_RUN | 不发送数据、不请求设备权限、不创建分享 | 保留原生；不声称全部功能覆盖 |
| 唯一工作区返回 | NOT_VERIFIED | 没有挂载正式导航 | 身份/文档归属/空位未成立，保持原生 | 未劫持浏览器Back/Forward，不增加第二导航 |

## 消息与原始时间证据

无扩展基线第一条，随后安装实验 probe 发第二/三条；总共 **3条真实、无私人内容的合成用户消息**，没有补发第四条。第一条从native click到可见回复约4417.4ms，只代表浏览器测得延迟。

这个真实变体使用 `LI[data-message-role=user|assistant]`、用户bubble内 `data-user-message-copy`，并非旧观察器的 `data-message-author-role`。第二、第三轮原生main/textarea及先前消息仍为原节点。结构字段与角色 marker 是当前可见DOM观察，**不构成账户、对话、branch或真实发送状态的全部可信 witness**。路由为非传统 /c/ 的匿名路径，不公开其值、前缀或原生ID，也不以路径推断账户。

逐个检查三个用户消息节点及后代：`time[datetime]`=0；timestamp/created-at/sent-at/datetime属性名列表均空。没有官方语义可复验的原始send-time来源；`originalUserSentAt=UNKNOWN`、`TimeCoverage=UNKNOWN`。本轮不读取 hydration JSON、网络响应、内部历史API、Cookie/Token、本地宿主存储或完整账户。没有能力证明所有潜在官方渠道均不存在，只能否定**本轮已检查的可见DOM渠道**能够满足v2.7时间合同。

UTC浏览器观测值明确字段为 `browserObservedBeforeClickUtc` / `observedBeforeNativeClickUtc`，绝不写入产品 UserSendEvent.sentAt、活动索引或30日分段。对话更新时间、观察时刻、访问时刻和AI输出都不能替代时间证据。真实访客工作区活动投影继续关闭。

## 原生刷新限制，原失败不改成 PASS

`guest-journey-first/results.json`：**8 PASS / 2 FAIL**，原件包括精确执行驱动和观察器源码。第9项要求刷新后保留三轮真实访客消息，实际TimeoutError；检查随后页面为官方 HOME，0 user/0 assistant，有登录/注册、原生输入，无网络错误/404。第10项Back恢复超时是前项丢失会话后的连带失败，不冒充独立反例。

**刷新前 probe 已stop并真正卸载**；这次原生访客恢复失败不能归咎于扩展数据库、人工资产或worker。在当前Chrome/变体/profile得到的是短期访客交互，不能支持持久历史工程承诺；不外推所有访客变体永久如此。没有改服务器/浏览器策略，没有延长期限、重发消息或弱化原恢复断言来制造PASS。

补测的“限制观察PASS”只表示实际0消息/HOME被记录；原持久化FAIL与最终LIMITED不变。

## 实验范围缺陷与最小修复

| 发现 | 类型 | 修复 / 重新验证 |
|---|---|---|
| 未匹配真实Octane消息属性 | 观察驱动 | 同时识别data-message-role/旧属性；真实1→2→3配对及3个用户时间结构重新观察；第一份漏计数原件保留 |
| 模型按钮非HTML button | 观察驱动 | 包含role=button；真实SPAN/aria-expanded/popover打开关闭证明，未修改模型选择 |
| 工具菜单100ms读取、返回open:true但未断言；首轮空gated列表 | 测试驱动 | 原首轮此项PASS仅表示无异常，不作为菜单存在证据；改成等待popover、三gated项断言与Escape关闭；补测实证通过 |
| 窄屏首次只返回结构、未强制布局断言 | 测试驱动 | 原布局实测无overflow/input可见；后续驱动增加严格断言；视觉截图仍保留原生弹出菜单状态，不称干净导航图 |
| 刷新丢失访客会话 / Back连带失败 | 真实宿主能力限制 | 原件保持FAIL，不在实验中“修复”真实网站；正式持久历史BLOCKED |

没有发现可由本实验安全修复的正式B1–B5/C1–C5/F1产品缺陷；没有修改其代码或重新实现CAS/lease/数据库。明确区分“不执行正式产品UI”与“已证明全产品兼容”。

## 真实 MV3 与原生生命周期证据

单一实验构建：`probe-build.json` 与 `guest-journey-first/results.json.buildHashes`。源码worker/content/broker hash在两个实际测试批次一致。工作树正式src/simulator/design与f151fb4一致；复用原broker的current-document校验，唯一实验不同是官方origin guard + 永远null的scope resolver。

实际顺序：无扩展基线→手动加载unpacked→在当前真实页面isolated world注入→runtime BIND通过真实worker→因无trusted scope拒绝→两轮原生消息继续→CDP观察worker running/stopping/**stopped**→再次真实BIND启动worker，boot由 `7c269c4f-bbbc-411b-9b5f-3519bda17728` 变 `e8bffe36-9acc-4bc1-8e54-c35d69247ece`→仍未知scope、原生节点保持→停止探针→真实卸载→原生刷新。

另在同Profile HOME重新加载同构建：原生合成**未发送**草稿→另开本轮about:blank控制tab→实际visibilitychange hidden/visible→原草稿/input/main/焦点保持→CDP冻结/恢复并观察真实freeze/resume事件→health仍拒绝未知scope→stop/uninstall→仅清除自己的未发送草稿→关闭本轮专用Chrome。没有重新发送消息、没有浏览器自动刷新制造恢复PASS。

这里证明的是**最小无DOM写入只读probe**，没有有效账户lease、生产投影或数据库，不能称为真实账户20秒lease/CAS/数据恢复验收。那些能力仅继承#13合成工程证据，本轮不重新执行。

## C2 可行路径与独立前置

现在可用：真实官方HTTPS、当前guest文档原生输入/回复、结构观察与本地只读扩展worker连接；未知身份下安全拒绝派生内容，允许原生继续使用。

正式接入还缺：可信且可撤销的当前网页account/organization witness；对话/Project/message/branch与当前scope的可靠绑定；获准历史发现/覆盖与消息级原始用户发送时间；真实阅读header/侧栏边界和单一返回空位在各variant/Canvas/原生浮层上的验证。`simulator/adapter.mjs`只认识合成语义边界，`simulator/build.mjs`只匹配loopback/hf；不能只扩展host_permissions就作为生产适配。只读实验既不复制第二导航，也不修改正式runtime的安全边界。

官方 [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart) 明确身份scope不授予聊天历史权限。即使未来使用官方OAuth，外部应用subject也不能单凭它证明此Chrome页当前账户、Project或消息时间。没有进行OAuth注册/取Token，不以普通OpenAI模型API补齐ChatGPT历史。

**未来统一最小需求（本轮不要求立即登录）：** 一个用户亲自登录、确认只有合成/非私人内容的清洁账户，已有T0普通聊天与P1/T1、P2/T2（含现成分支/编辑样本才验证对应项）。验证未打开/跨30日历史需用户明确批准对应clean样本及最小观察范围；若官方clean导出可提供，则另批准文件范围并验证字段语义/覆盖，不能从未授权内部接口取全账户。第二清洁账户/组织仅在A/B隔离轮次另授权；PAIA实际共存另授权。缺样本时继续标UNKNOWN/NOT_RUN，不自动创建或改写真实Project/历史。

## 命令、证据与截图

实际执行命令见 `COMMANDS.json`；正式代码未变，所以不重复160 Node/49 DOM/100k已通过验收。新增7条实验安全合同PASS；实际第一消息PASS；真实旅程8 PASS/2 FAIL；补测6 PASS。补测不是抹掉失败的“全绿回归”。`evidence-verification.json`校验实际构建、原执行源码归档、原失败、worker停止/新boot、scope拒绝和正式代码不变。

公开只保留合成内容、聚合结构/错误类别/worker状态；截图已实际查看后原像素复制。未公开账户标识、会话ID、Chrome私有日志/profile、Cookie/Token、HAR或其他个人文件。检测是有限pattern scan加人工查看，不宣称绝对隐私认证。

- `guest-native-baseline.png`：无扩展真实访客基线。
- `guest-first-message.png`：真实第一条合成消息与回复5，无扩展。
- `guest-narrow.png` / `guest-dark.png`：三轮会话尾部、真实窄屏/深色，保留原生工具popup当时状态；不是消费级VAIWL UI截图。
- `guest-tools.png` / `guest-model-menu.png`：补测真实popover与guest登录门槛，未调用工具/未改变账户设置。
- `guest-refresh-failure-observation.json`：刷新失败后0消息HOME结构。
- `guest-journey-first/`：首轮原始结果及精确执行源码，不重标。
- `guest-supplement/results.json`：不发送消息的菜单/背景/冻结/关闭补测。
- `SHA256SUMS.json`：所有当前实验源码、构建及公开证据哈希。

当前授权匿名范围完成。本轮结束后没有后台浏览器测试或继续发送行为，保留可恢复Git断点；生产准入障碍如上明确，不继续合成测试制造真实接入完成率。
