# 原始研究来源、完整性与转写映射

登记日期：2026-10-10。此次是原研究成果整理，不重新调查市场或生成原型。原稿的全部产品/技术主题分配到本仓库专题文档；它们是整理版而非逐字节原稿副本。

## 1. 原件位置与校验

已实际访问原对话附带的 `research.html`、`prototype.html` 与 `ChatGPT_Workspace_Research_2026-10-10.zip`。工作容器当时路径分别为 `/mnt/data/workspace_research/research.html`、`/mnt/data/workspace_research/prototype.html` 和 `/mnt/data/ChatGPT_Workspace_Research_2026-10-10.zip`。这些是当时的附件路径，不是 GitHub 路径，也不承诺未来 Codex 容器能直接访问。

ZIP SHA-256：`401f3788e017daf24a4cda64f74e23a6154678ee346e413e2916bf7310a2e100`。CRC 检查没有坏成员，路径均为包内安全相对路径。两个独立 HTML 与 ZIP 内相应文件逐字节相同。没有修订原稿或原型。包内根目录是 `ChatGPT_Workspace_Research/`。

所有 13 个成员已读取：报告/原稿与 41 项来源、原型完整 HTML/CSS/JS、测试脚本与记录，以及四张原始截图。图片使用原图检查，没有 OCR 转写、重新渲染或生成替代品。

| 包内相对路径 | 字节数 | SHA-256 |
|---|---:|---|
| README.md | 1803 | `6802e31785e1249d1e38e71fb3bb1e96d901b682150a28dfb200d5ce8c9f98e2` |
| prototype.html | 57018 | `543f5adf428125d86d6e00a01f054114f9cbc7e548f75a3fd2faf54ffc9f0375` |
| research.html | 83201 | `47a918bceed7f1417ded337d67c55c1ddb2a424260dfbd15976d704c8566e604` |
| research.md | 68270 | `89af00ec83c471f7526a9b27781c1728abfb23a61669d8db20f74b6f9a156c9b` |
| sources.json | 7052 | `a426bd476b1ca12613249b8f03cc3b964c5ff178d6fc0da507f041df9a5630fa` |
| validation/VALIDATION.md | 2961 | `62564026ea7f0afffbf04853f4bea202ad8031ec9d69bcddd2bae0cd8a5a1c9d` |
| validation/conversation-desktop.png | 193609 | `7b2f18096bb29e53d44d88c13f742b3e8b555a02b48938b5b551478e7a15af07` |
| validation/conversation-mobile.png | 93426 | `a6ef5d19df6b8a8981e8bd593afaf59ee580e7b01b5ed8b564376e7ddfe287c8` |
| validation/last-run.log | 3162 | `2062ef137aa8a580102794056fe05074fe78095e9f2b7e92ff97baca9fe10888` |
| validation/report-desktop.png | 263644 | `426ecd958e86b90c05b9ab9285b687a610f5a316f61f7faf1bf4d1d1e00e3e94` |
| validation/test-results.json | 3161 | `e12c9c5ad932f857a916cf9c3e13fd694e167c9b1402d11d15a3ac81aeab3282` |
| validation/test_prototype.py | 10419 | `df8e1f7316be0b4edf6e87b66a26d2bbcb7a6e7408e7bafa275c665a9d0dc0d3` |
| validation/workspace-desktop.png | 194253 | `fe600e39e0c963158d9bd4b88bfefd48d9ae26653988620b33d61546011e4622` |

本轮严格只提交 Markdown 设计/计划/治理；不将 HTML、PNG、ZIP 或 Python 脚本作为仓库已存在文件描述，也未上传它们。本表提供原件校验和来源链，不代替文件内容或未来取得原件。后续若需要修改/复现原型，原件不可访问应说明缺失，不能自行重画然后宣称沿用原版。

## 2. 原研究每一节的落点

原 research.md 共 781 行；§0–20 与完整来源表均已读。下表是专题拆分，不删掉不利结论。

| 原稿章节 | 仓库落点 |
|---|---|
| §0 结论/三项前提 | PRODUCT_PROPOSAL §1–2、AUTHORITY、README |
| §1 方法/五仓库/PR 快照 | 本登记、INTEGRATION_BOUNDARIES、AUTHORITY |
| §2 竞品及证据限制 | PRODUCT_PROPOSAL §3、下方 S1–S12 |
| §3 用户问题/指标/非目标 | PRODUCT_PROPOSAL §1、§6、§8 |
| §4 四对象/分面/多归属/片段 | PRODUCT_PROPOSAL §4、INTERACTION_SPEC、DATA_MODEL |
| §5 页面/视觉/可访问性 | INTERACTION_SPEC §1–2、§10、DECISIONS |
| §6 完整流程/故障/分享 | INTERACTION_SPEC §3–9、PRIVACY_SAFETY_RECOVERY |
| §7 标题/三层名称/序号/演化 | AI_NAMING_EVALUATION、INTERACTION_SPEC §5、DATA_MODEL |
| §8 证据包/候选/约束/稳定/中文 | AI_NAMING_EVALUATION §1–3 |
| §9 AI/Agent/端侧/官方接入/成本 | AI_NAMING_EVALUATION §4–5、DEVELOPMENT_PLAN D/G |
| §10 历史渠道/覆盖/导入安全 | DATA_MODEL §3/5、PRIVACY_SAFETY_RECOVERY §3、R0-02 |
| §11 条款/权限/发布 | PRIVACY_SAFETY_RECOVERY、R0-00、DEVELOPMENT_PLAN F3 |
| §12 架构比较/DOM/导航/能力/MV3/权限 | PRODUCT_PROPOSAL §7、TECHNICAL_ARCHITECTURE |
| §13 数据/写入/备份/加密同步 | DATA_MODEL、PRIVACY_SAFETY_RECOVERY §7、B/F2 |
| §14 三重身份/威胁/可信授权 | TECHNICAL_ARCHITECTURE、PRIVACY_SAFETY_RECOVERY、R0-01 |
| §15 原生改名独立通道 | PRIVACY_SAFETY_RECOVERY §5、DEVELOPMENT_PLAN E |
| §16 PAIA 与旧项目 | INTEGRATION_BOUNDARIES、R0-05、G1 |
| §17 E1–E10/困难集/指标限制 | DEVELOPMENT_PLAN §9、AI_NAMING_EVALUATION §6、R0 |
| §18 A–G 完整路线 | DEVELOPMENT_PLAN 全文，保留高级能力但分离依赖 |
| §19 商业/长期风险 | PRODUCT_PROPOSAL §8 |
| §20 原型与真实产品界线 | PROTOTYPE_EVIDENCE、AUTHORITY、README |
| 引用/开放 PR 附录 | 下方 41 项来源、INTEGRATION_BOUNDARIES |

专题文件都在 `docs/`；R0 位于 `docs/experiments/`。原研究里的数字是目标，原型默认行为是建议；本轮工程任务、逻辑字段与反例是从原材料展开的验证要求，不是已实现事实。

## 3. 证据继承规则

G1–G13 为原研究读取的固定仓库快照；G6 的 PR URL 本身动态，候选 hash 在 INTEGRATION_BOUNDARIES 单独固定。S1–S28 为原稿记录于 2026-10-10 查阅的来源，本次只迁入引用，没有重新打开网页认证其当前状态。S7–S12 是供应商声明，不能当独立实测。

尤其 S3（Space）、S4（不同计划导出）、S18（端侧模型语言/设备）、S20–S21（官方身份/用量与资格）、S22–S24（账户/会话/条款）均有动态性。不得将引用存在写成“当前正式支持/合规已经确认”；R0 只对会改变能力结论的来源做定向复核。

## 4. 固定仓库来源 G1–G13

| ID | 来源 |
|---|---|
| G1 | [ACS 当前能力试验状态](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/status/ACS_STATUS.yaml) |
| G2 | [ACS Frozen Design v0.1](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/docs/FROZEN_DESIGN_v0.1.md) |
| G3 | [ACS 原生列表投影与恢复试验代码](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/src/content.js) |
| G4 | [Context Tabs 当前状态](https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/status/CONTEXT_TABS_STATUS.yaml) |
| G5 | [Context Tabs 标签页事件与视图](https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/src/sidepanel.js) |
| G6 | [Chat Title Manager Draft PR 1](https://github.com/haohongfei2001-png/chat-title-manager/pull/1) |
| G7 | [CTM 固定候选命名代码](https://github.com/haohongfei2001-png/chat-title-manager/blob/3222066812e08aa75119247de5ec5968e3bfbaeb/src/naming.js) |
| G8 | [PAIA manifest 研究快照](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/manifest.json) |
| G9 | [PAIA STATUS 研究快照](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/docs/consumer-product-v1/STATUS.md) |
| G10 | [PAIA 用户输入数据与产品边界](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/README.md) |
| G11 | [PAIA 被动 response observer](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/content/response-observer.js) |
| G12 | [HCL 当前队列/能力研究快照](https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/README.md) |
| G13 | [HCL Assistant-first UX](https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/docs/UX_SPEC.md) |

## 5. 官方/厂商来源 S1–S28

| ID | 来源与继承范围 |
|---|---|
| S1 | [OpenAI Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)；原生 Project 语义 |
| S2 | [OpenAI 查找聊天/项目/文件](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)；搜索不只标题的原记录 |
| S3 | [OpenAI Space](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt)；时点记录，当前能力未复核 |
| S4 | [OpenAI 导出数据](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)；计划、格式、等待与有效期需重验 |
| S5 | [OpenAI Temporary Chat](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt)；原引用原样保留 |
| S6 | [OpenAI 分享聊天与任务](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt)；共享与自有区别 |
| S7 | [Chrome Web Store AI Toolbox](https://chromewebstore.google.com/detail/ai-toolbox-folders-prompt/jlalnhjkfiogoeonamcnngdndjbneina)；厂商声明 |
| S8 | [AI Toolbox 官网](https://www.ai-toolbox.co/)；厂商声明与同步说明 |
| S9 | [Chrome Web Store Superpower](https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc)；厂商声明 |
| S10 | [Organizer / Smart Auto Folders](https://chromewebstore.google.com/detail/chatgpt-organizer-smart-a/fifjakginaannmjjejmfagoglkiocbco)；厂商声明 |
| S11 | [Organizer & Workspace](https://chromewebstore.google.com/detail/chatgpt-organizer-workspa/mngeddjcngpcdakdhfcbaefeonmmeomg)；不同产品，不合并特性 |
| S12 | [Sortbase](https://sortbase.ai/)；厂商声明 |
| S13 | [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)；DOM/隔离环境 |
| S14 | [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)；生命周期 |
| S15 | [Chrome storage/origin](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)；存储边界 |
| S16 | [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)；设置与权限暴露 |
| S17 | [Chrome Web Store user-data policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)；发布披露 |
| S18 | [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)；模型语言/设备动态资格 |
| S19 | [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)；运行支持不等于中文模型质量 |
| S20 | [Sign in with ChatGPT / OSS](https://developers.openai.com/siwc/token-sharing-open-source)；时点引用，不是已获接入资格 |
| S21 | [Sign in with ChatGPT / website](https://developers.openai.com/siwc/website)；身份/商业路径待核验 |
| S22 | [OpenAI account switching](https://help.openai.com/en/articles/20001068-use-multiple-accounts-with-account-switching)；账户切换 |
| S23 | [OpenAI API conversation state](https://developers.openai.com/api/docs/guides/conversation-state)；不冒充网页历史 API |
| S24 | [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)；定向审查，不自行认定合法抓取 |
| S25 | [Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)；不作默认消费者权限 |
| S26 | [Chrome offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)；用途/生命周期 |
| S27 | [Chrome remote-hosted-code policy](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)；不下载执行修复代码 |
| S28 | [Chrome declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)；最小必要权限 |

## 6. 新增事实与未验证项

本次原件完整性、包内一致性、原型模拟实现差异及新仓库初始状态可作为本次证据；原 20/20 只作为带原始环境的历史模拟记录。其余真实 Chrome 扩展/ChatGPT/账户/历史/PAIA 共存/模型效果均为 NOT_RUN 或需独立批准验证。完整对照见 [PROTOTYPE_EVIDENCE](PROTOTYPE_EVIDENCE.md)。
