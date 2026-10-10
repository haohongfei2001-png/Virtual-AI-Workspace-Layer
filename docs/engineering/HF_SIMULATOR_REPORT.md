# 高仿真宿主测试平台：工程交付与裁决

2026-10-11，版本 0.1.0。**平台已建立；云端逻辑与实际 DOM 回归通过，正常 URL/IndexedDB/MV3 验收受管理员策略阻塞。整体 LIMITED。**

## 基线、授权与范围

基于 PR #5 最新 `67653a293abebeb57b53f6568199f0e322db1c70`，目标分支为 `feat/vaiwl-b1-scope-broker-20261011`。PR #1 为 v2.7 / `79dbfa7`；PR #4 为 R0 / `7d47d97`。核对现有工作约束、STATUS、核心流、原生保留、架构和开发计划；本轮直接授权扩展为合成宿主及导航集成，不修改产品 Canonical 或开发计划。

main、PR #1/#4/#5、PAIA 及其他仓库没有改变。不调用 Remote Desktop Commander，不连接 Mac，不登录 ChatGPT，不读取私人数据，不安装日常浏览器，不使用付费服务或 GitHub Actions。

复用 B1 的 `ScopeRepository` 和 `DocumentBindingBroker`。identity、repository 与继承的 10 项 broker 单元测试按 PR #5 Git blob 逐字节核验。B1 唯一变更为异步返回前作用域复核，见下文；没有第二套 VAIWL 持久数据库。

## 实际交付

`simulator/` 是可启动的原生 Web 宿主、控制台、数据生成器、风险变体、page/MV3 适配器和可重复扩展构建。`src/navigation/` 是实际复用的 v2.7 时间投影和导航组件；普通页面集成及 MV3 bundle 使用同一源文件。`tests/hf/` 包含 Node、Playwright DOM 及无假降级的正常浏览器/MV3 驱动。启动命令详见 `simulator/README.md`。

宿主自行处理输入、附件、模型/工具、原生搜索、项目、固定/归档、分享/权限/文件弹窗、消息编辑、分支、重新生成和模拟流式生成。VAIWL 仅管理主题引用与自有界面。首页卡片、紧凑窗口、固定 30 当地日历日分段、相邻上下箭头、主页静态主题标题、左侧旧窗口展开、连续主题导航、单一阅读返回、历史/展开/滚动恢复均已接入。

测试集含 A/B/unknown、两个 Project、同名不同 scope、缺时间、覆盖缺口、归档/无权对象。最终压力集为 **120 主题 / 604 引用，单主题 128 窗口，长聊天 160 消息**。早期 488 引用压力集扩大为 604，而非为了测试通过减少样本。

## 保真程度

**行为保真：** 使用真实 textarea、File input、dialog、popover、事件、DOM 节点引用、增量文本更新、原生路由控制器和异步任务。可实际操作，不是按钮装饰。宿主与扩展生命周期独立，能生成不利于扩展的 DOM/状态变化。

**布局保真：** 依据公开 ChatGPT/Projects 资料近似侧栏密度、阅读区、输入区、菜单层、间距、圆角、深浅主题、悬停/焦点与窄屏。没有专供 VAIWL 的空挂载槽。没有实时登录态视觉标定，不能宣称像素级一致、复刻当前 React DOM 或给出保真百分比。

**生命周期保真：** 验证稳定原生节点与宿主主动重建的区分，输入草稿/选区、交互值、原生增量生成、延迟/失败/乱序及 A/B 切换。合成项目权限独立，但不等于真实 ACL、React reconciliation、服务端流协议、虚拟化、IME 或完整无障碍证明。

## 执行环境和证据分级

Linux 6.18.44 x86_64 / Node 22.16.0 / Python 3.13.5 / Python Playwright 1.57.0 / Chromium 144.0.7559.96。Node loopback HTTP 服务实际启动，资源加载与路径拒绝测试通过。Git 直连 DNS 不可用，仓库读取/写入经已连接 GitHub 工具完成。

| 层级 | 本轮实际结果 | 边界 |
|---|---|---|
| A 逻辑、构建、服务器、B1 合同 | **38/38 PASS** | 包含继承 B1 10 项、新增竞态 2 项及时间/数据/构建/HTTP 26 项；mock 合同不等于 IDB 事务 |
| B Chromium DOM | **38/38 PASS** | 实际 Chromium、真实 DOM/事件/几何；`set_content` opaque 页面，明确 fake router/sender/read-only catalogue |
| B 正常 URL + 页面 origin B1 IDB | **BLOCKED** | URL 导航被管理员策略禁止，未执行 origin 存储与实际 Back/Forward |
| B 真 MV3 | **BLOCKED** | `Extensions.loadUnpacked` 明确返回管理员禁止；没有 content script/worker/扩展 IDB 通过声明 |
| C 真实登录 ChatGPT | **NOT_RUN / BLOCKED** | 本轮不登录、不请求额外真实账户授权 |

“B DOM 通过”仅表示该列，不表示整组 B 通过。所有 browser case 的 expected/actual、环境、源码 bundle hash 在 `hf-results/browser-final.json`。每个场景独立上下文，未观察到页面 JS 错误或页面网络请求；没有全浏览器进程抓包声明。

环境拒绝同样包括正常 HTTPS 测试 origin 与 file 导航。未改变管理员策略，也没有用伪造 origin 授予真实身份/存储。opaque 模式的逻辑 URL 只是测试依赖注入，浏览器实际仍为 about:blank；真实浏览器历史和 SPA URL 导航保持 BLOCKED。

## 发现的问题和修复

1. **B1 缺陷：** GET_REF/LIST_REFS 在等待存储后，仅复核文档/lease；账户在 URL 不变时改变，旧结果可能返回。先运行两个反例并得到 2 FAIL，再增加返回前 `currentAuthority` 检查，两个原断言通过，继承 10 项 B1 合同也通过。此修复仅在本分支。它是响应暴露屏障，不是账户变化与 IDB commit 原子性的证明；真实 resolver 和及时撤权仍不可缺少。
2. **导航缺陷：** 返回工作区时读取隐藏 scroller 的零值覆盖保存位置；且隐藏阶段设置 scrollTop 无效。修复只在可见当前 scroller 记录位置，并在重新显示之后恢复。D16 相同断言从 FAIL 到 PASS，实测恢复 300px，保留段和展开状态。
3. **适配缺陷：** 动态原生头部 flex 内容可能被返回按钮压缩，却被误算为空闲空间。现对有内容的伸展区域保守退让，不挤压原生内容。D23 从 FAIL 到 `NATIVE_ONLY` 安全结果；不是把无增强等同完整功能。
4. **运行器错误：** 初次诊断属性名写错；B 账户测试错误地期待不存在的标题前缀；真实 Extensions CDP 方法初次发到 page session 而非 browser session。分别修正测试驱动/实际 fixture 预期与 CDP 目标；原结果保留，不归罪于扩展，也不把它们当成功证据。

历史账本：早期 DOM 第一次启动断言失败且进程超时；完整 attempt2 为 31 PASS/4 FAIL，attempt3 为 34 PASS/1 FAIL。之后同一滚动断言单独复验通过，旧 35 个场景在扩展后的 37 项完整回归中全部通过，最终扩大压力并加入原生固定/新建/长列表后为 **38/38**。不把历次通过数累加。原始日志及更早截图在交付 ZIP；GitHub 保存失败项、运行哈希、修复 diff 和最终原始结果。

## 仍然受限的内容

当前为保守的附加式导航，原生聊天列表保留；尚非生产侧栏替换验收。工作区是自有视图对原生阅读区的可撤销遮罩，原生节点不拆除。真实禁用/冻结后遮罩是否残留仍未验证，禁止因此放行生产接管。

B1 实际 origin 存储代码已接入正常 page/MV3 两条入口，但当前云端只能测试 broker 合同与 DOM 的只读 catalogue adapter。不能宣称当前新平台已通过实际持久化、跨 tab IDB CAS、worker 冷启动或重载清场。PR #5 的历史 Mac 实验不能当成本轮新集成的回归通过。

视图状态暂存在每 scope 的内存映射；稳定主题 ID 来自合成清单。不是 B3 持久 Workspace 和完整人工命令系统。宿主新发送不会被误写为已完成的 B2 真实事件采集。真实历史/时间/导出/Project/账户渠道仍需另行验证。

20 秒 lease 到期会撤下增强，不使用心跳保活。长期连续使用的事件驱动重新绑定、禁用/重启自动恢复、真实冻结、物理 IME、读屏、200% 缩放和当前 ChatGPT 原生功能五格未完成。

## 下一阶段裁决

**可继续 B2/B3 的独立工程和 C1/受限 C2 的合成宿主开发。** 平台已能复用以定位真实组件状态损坏、错误归属、布局冲突和失效清理；无需重开产品设计。下一最有价值的是在此平台接入 B2 的有来源事件/coverage 与 B3 的持久化人工意图，并保持同一 B1 仓库，而不是把合成清单升级成生产账户证据。

**不放行真实 ChatGPT C2 接管、完整 C5/C6 或发布。** 首先需在允许 loopback 与未打包扩展的隔离 Chrome 环境运行已交付真实驱动；之后才是另获授权的清洁 ChatGPT 账户、原生功能/身份/时间与 PAIA 本体兼容验收。

本轮不需要 Mac 即可完成这些交付。要解除当前环境的 MV3 门槛，需要另一个允许相关操作的隔离环境，并非必然是个人 Mac；本轮没有擅自调用其他云资源。若将来单独授权 Mac，最小范围为新临时目录、新 Profile、此宿主与扩展、合成测试，不需日常 Profile 或真实 ChatGPT 登录。

到测试平台 Draft PR 交付即停止，不合并任何 PR，不自动启动 B2/B3 或其他模块。

## 公开参照（机制说明，不是实测替代）

- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt
- https://playwright.dev/python/docs/chrome-extensions
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/reference/api/webNavigation

公开截图只用于布局参照，未复制 OpenAI 资产、私有 DOM 或字体文件。
