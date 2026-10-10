# R0 架构裁决与数据渠道边界

本文件裁决技术路线及放行条件，不重写产品目标、UI 或既有 A–G 开发计划。证据以同目录原始 JSON 为准；未测能力不因候选架构看起来合理而升级。

## ADR-01：保留原生应用，只拥有派生导航表面

**选择：LIMITED GO 的方向，不是完整宿主验收 GO。**

保留 ChatGPT 原生正文、输入、菜单、工具 portal、生成、交互回复、搜索、账户与专用页的节点和处理器。VAIWL 只拥有自己的挂载、样式、派生引用和导航状态。以 Shadow DOM 做样式/组件封装，以扩展 origin 数据仓库保存派生资产；不把 Shadow DOM 当作安全数据仓库或账户隔离证明。

C01–C07、C10、C16–C17 证明上述低控制边界在真实 Chrome 的合成页面可工作。它们没有证明真实 ChatGPT 存在同样的安全插槽，也没有证明完整连续侧栏和每个原生功能都兼容。

拒绝作为正式前提：克隆 ChatGPT UI、移动/重建 composer/transcript、隐藏整个原生应用、依赖未公开 React store、补造内部路由、把自动刷新原生聊天当作退出。插槽不唯一或被占用时退出增强，不覆盖原生功能。

## ADR-02：文档/路由失效与账户认证分层

**浏览器文档/路由机制：GO；真实账户 witness：BLOCKED。**

真实 MV3 协议已使用 Chrome 提供的 tab/frame/document/lifecycle/URL；路由变体实际收到 `webNavigation.onHistoryStateUpdated` 并撤销旧挂载。正式实现应采用浏览器文档换代验证、epoch/请求相关性和有界撤销。异步结果在返回和提交时都必须重新验证当前性。

浏览器 tabId/documentId/URL、当前 Chrome Profile、扩展自己的登录、用户选择的 vault、头像/昵称或同名聊天均不等于当前 ChatGPT 账户/组织。原生 Project 是同一账户/组织范围内的归属维度，不是账户认证来源。真实清洁 A/B/组织样本尚未取得，不能在生产中接受合成 witness。

原 PR #3 的“不同 document 一律等待旧 lease 过期”合同在 C09 出现可用性失败。正式 broker 必须允许经浏览器当前文档证明确认的换代，同时拒绝旧文档延迟响应；不能去掉隔离检查来消除失败。

## ADR-03：可丢弃 worker + 扩展 origin 持久化

**原语 GO；完整仓库 LIMITED。**

C11 真实停止/唤醒 worker，内存哨兵丢失；C12 一个已提交的扩展 origin IDB 合成记录仍在，宿主 origin 的数据库枚举没有该库。可以据此启动 B1 的仓库实现。仍需自己实现 scope key、引用去重、revision/CAS、操作幂等、迁移、配额和坏数据恢复。

没有通过长连接或频繁心跳把 worker 当常驻服务。本轮未验证自然闲置回收、写到一半被终止、配额耗尽、多写者或跨版本升级；不能把“一个记录保留”当作 B4/B5 完成。

## ADR-04：disable/reload 与敏感投影

**即时无残留方案：未通过；当前原始接管方式 NO_GO。**

实际禁用后 250ms 旧挂载仍存在；只有活跃 JS 计时器之后清除。正确临时开发者模式下扩展重载可恢复，但仍留旧 DOM；显式刷新合成页面才能重新注入。冻结试验未产生有效冻结，不能拿它证明隐私安全。

因此不能把“正常 dispose 会调用”或“四秒后会删除”作为任意禁用/冻结/账户变更下的无条件保证。必须区分：原生功能继续可用、布局残留、敏感内容失效、扩展重连。当前只放行非敏感探针/纯数据底座；敏感导航接管仍需真实账户与恢复验证。未来方案可以缩小控制面，但不能未经验证就宣称某个替代容器天然解决清场。

## ADR-05：数据渠道，不承诺不存在的完整性

| 渠道/对象 | 本轮证据 | 可支持的最窄判断 | 不得据此宣称 |
|---|---|---|---|
| 当前网页可见 DOM | 仅合成 DOM；真实公开访问 403 | 内容脚本具备读取其获准页面 DOM 的技术机制 | 已识别真实账户、角色、分支或消息时间 |
| 用户主动打开的对话 | 真实宿主未执行 | 后续可验证的按需前向观察候选 | 已打开就等于所有消息/分支完整，或所有发送时间可见 |
| 尚未打开的历史对话 | 没有执行任何自动遍历/内部接口 | 可考虑用户主动取得的官方导出作为批量输入 | 侧栏标题、日期分组或 updated_at 足以还原原始用户活动 |
| 原生 Project 内对话 | 三类合成引用通过 | 可以统一组织同 scope 的不可变引用 | 已读取真实 Project、合并上下文或获得该 Project 权限 |
| 官方导出 | 官方文档确认有对应入口；本轮没有真实样本 | 授权、用户主动发起的批量数据输入候选 | 已实现官方格式解析、准确发送语义或完整实时覆盖 |
| 当前浏览器的新发送捕获 | 只测试规范化事件，不是宿主适配器 | 可研究“真实发送动作 + 可靠提交关联 + 身份/分支/精度”形成前向证据 | MutationObserver 执行时间、页面打开时间、AI 回复时间就是原始发送时间 |
| 其他标签页/设备/离线期间 | 未持续观察 | 必须形成缺口/未知状态 | 一个局部观察器或旧快照能证明之后没有新发送 |
| 原生搜索 | 合成未索引结果仍可达 | 派生查找应声明已知范围，原生搜索继续独立可用 | 已知索引就是账户全部历史 |

官方说明：ChatGPT 设置内导出适用于 Free、Go、Plus、Pro 和符合条件的 Edu；Business、Enterprise、Healthcare 工作区无自助导出，应联系组织管理方。导出 ZIP 包含聊天历史等账户数据，但文档并未承诺本产品需要的字段格式、事件语义、时间精度和跨分支完整性。不能把“存在导出入口”写成“本轮导入器已通过”。

本轮合成 ZIP 解析器明确拒绝未知 schema，不猜测 `chat.html` 或某个 JSON 文件永远存在。测试中的 `SYNTHETIC_ORIGINAL_SEND` 和 `SYNTHETIC_ATTESTED_COVERAGE` 是实验预设，不是可伪造后供生产接受的来源标签。

真实导出后续必须验证：用户角色；消息/分支身份；失败/重试/编辑和新发送的区分；原始时间及精度；重复/冲突；缺失、删除与导出截止覆盖。即使有 user 节点的 create time，也不能未经语义验证就把编辑或分支重建当作新发送。

**答案：有值得验证的官方批量路线和前向观察路线；本轮没有建立可靠、普适、持续完整的全历史/发送时间路线。** 禁止内部历史接口和自动全量抓取的边界保持不变。

## ADR-06：30 个当地日历日与 coverage 是数据正确性，而非 UI 筛选

对当地日期 T，第 k 段为 `[T+1−30(k+1), T+1−30k)`，k≥0。它不是自然月，也不是 720 小时。UTC 原证据不随时区变化被改写；展示段随指定本地时区和午夜重算。

一个主题只有一个归属段，取其可证明的最新原始新发送；旧窗口留在父主题下。一个当前段的可靠正事件足以证明主题在当前段；确认旧段则要排除所有相关成员在之后的新发送。缺覆盖则 UNKNOWN，不借访问/updated_at/导入时刻补齐。历史快照的“当时完整”与“现在新鲜”必须分离。

27 项新增离线测试覆盖这个合同。参考日期是固定合成的 2026-10-10，不是伪造执行当天发送记录；函数以任意明确当地日期计算。压缩比/字节限制只是合成 ZIP 的安全边界，不是产品规格。

## ADR-07：跨 Project 仅派生引用

本轮三类引用来自相同合成账户/组织：普通聊天、P1、P2。聚合和派生改名后源对象没有变化，另一账户/组织同名引用被拒绝。真实链接必须来自已验证宿主证据，不能从猜测路径生成。点击仍进入原生对话；权限、Project 文件、指令和记忆由原生继续决定。本轮没有真实跨 Project 点击验收。

## 正式工程启动裁决

| 既有任务 | 技术启动条件 | 尚未获得的条件 |
|---|---|---|
| B1 Scope/引用 | 可开始受限实现：扩展 origin IDB、严格 scope/引用模型、文档换代 broker、unknown 禁读写、worker 冷启动 | 真实宿主身份提供方仍未验证；本轮不自动授权实施 |
| B2 获取/覆盖/导入 | 纯时间/覆盖投影与输入验证合同可实现 | 真实官方格式和新发送捕获语义不能视为已解决 |
| B3 派生资产/意图 | 在 B1 后可推进纯派生资产；不写原生归属 | 完整仓库/产品命令尚未开发 |
| B4/B5 并发/恢复 | 已有技术方向与持久化原语 | CAS、损坏、配额、迁移、写中断恢复各自未验证 |
| C1 主题卡片/分段 | 规则内核可依既定 v2.7 实施 | 真数据覆盖和相应 B 层尚未具备完整闭环 |
| C2 原位外壳 | 不放行真实接管 | 真实账户、原生全部五格、实际侧栏/返回插槽、停用恢复 |
| C3–C6 | 不能以本轮 fixture 宣称完成 | C2 与可见干净宿主、真实 IME/无障碍/日常闭环 |

**下一项具体工程：B1 的 ScopeRepository + DocumentBindingBroker。** 目标是把已验证的存储原语和范围合同变成一个能拒绝未知身份、隔离 A/B、允许可信新文档接替且拒绝旧异步提交的扩展底座。先解决 C09 文档换代，不先继续装配 UI，也不把伪造时间或私人历史接口当捷径。真实宿主接入仍需另行清洁账户授权。

## 官方技术依据（2026-10-11 核查）

以下文档是机制/渠道依据，不是本项目运行通过的替代证据。

- Chrome content scripts / isolated worlds: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome webNavigation、documentId、historyStateUpdated: https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- Chrome service worker lifecycle / persistence: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome runtime reload: https://developer.chrome.com/docs/extensions/reference/api/runtime
- Chrome DevTools Extensions domain: https://chromedevtools.github.io/devtools-protocol/tot/Extensions/
- Chrome debugging 与独立 user-data directory: https://developer.chrome.com/blog/remote-debugging-port
- Playwright Chrome extension testing: https://playwright.dev/docs/chrome-extensions
- OpenAI 官方导出说明: https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data
- OpenAI Projects 说明: https://help.openai.com/en/articles/10169521-projects-in-chatgpt
