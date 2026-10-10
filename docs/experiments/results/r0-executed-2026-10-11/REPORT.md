# VAIWL R0 实际执行报告（2026-10-11）

## 最终裁决

**整体：LIMITED。扩展机制和隔离数据底座获得真实 Chrome 证据；完整真实 ChatGPT 产品尚未放行。**

本轮不是又一份待执行计划。已在获准 Mac 的独立临时目录，实际加载原始 MV3 探针、运行 Chrome fixture、终止并唤醒真实 worker、操作扩展禁用/重启、验证扩展 origin 的 IndexedDB，并保留失败。没有把页面 fixture、合成账户或 PAIA 占位当成真实宿主验收。

真实登录 ChatGPT 功能通过数为 **0**。一次全新未登录 Profile 的公开页面访问得到 HTTP 403/“请稍候…”页面，没有进入应用，也没有绕过挑战。清洁账户、真实原始发送时间、真实 Project 归属、完整原生功能与实际 PAIA 仍有明确门槛。

## 1. 基线与授权

- PR #1 仍为 Draft，设计分支最新 head 是 `79dbfa7e6e71595bfcc543334204975000469ac9`；执行前及交付前核对。main 基线是 `76e3dbdb283769e5c94fcef2de35f6b21cf7e49c`。
- 发现已有 Draft PR #2（Chromium 页面 fixture）和 #3（MV3 源码准备），此前“R0 未执行”状态文字没有完整反映这两项。它们都不能代替本轮真实 Chrome MV3 执行。
- 从最新 PR #1 head 建立独立分支 `experiments/vaiwl-r0-executed-20261011`。从 PR #3 的 `d5c66221f18a24145974b9696a8788a5a8b90155` 复用 27 个实验/测试文件，逐文件 Git blob 和 SHA256 验证不变；不复制旧 workflow。
- 已读取用户要求的十份治理/设计/技术文档。现有设计目标与 v2.7 不变；设计文档中历史“未授权/未加载”不覆盖本次用户单独授予的隔离实验授权，也不因本次授权变成正式产品开发许可。
- 仅提交 `experiments/r0/`、`tests/r0/`、`docs/experiments/results/`。不改 main、PR #1、其他仓库、日常 Chrome Profile 或 PAIA 安装。

## 2. 实际环境和工具边界

| 项目 | 实测值 |
|---|---|
| Mac | macOS 27.0，build 26A428，arm64 |
| Chrome | Google Chrome 154.0.8037.99；JS 15.4.80.20；CDP 1.3 |
| Node/npm/Python | 26.8.2 / 11.19.1 / 3.14.7 |
| 框架 | 项目局部安装 Playwright 1.64.0；已提交安装锁文件 |
| 浏览器方式 | headless，独立 mkdtemp Profile，Playwright debugging pipe |
| 扩展加载 | 真实 `Extensions.loadUnpacked`；仅该进程使用 `--enable-unsafe-extension-debugging` |
| 页面 | 127.0.0.1 随机端口的合成 fixture；原始扩展只匹配指定 loopback 路径 |
| 数据 | 合成账户标识、普通/Project 引用、用户事件、ZIP 与独立 PAIA 占位 |
| 工具能力 | 远程终端、局部文件和依赖；通过 Playwright/CDP 操作真正浏览器与扩展，不是普通离线 DOM 模拟 |
| 未证明 | 正常可见窗口的人工 IME/焦点切换、真正后台冻结、真人可发现性、登录态 ChatGPT |

Mac 在线，最初复合终端命令被安全层拒绝；收窄成只读探测后正常执行。ChatGPT 自带隔离容器的 Chromium 曾出现 loopback 管理策略阻断和扩展 worker 未启动；未修改这些策略，也没有因此停止 Mac 实验。

实验页面请求拦截未记录外部页面请求；探针不包含外网调用。没有全浏览器进程抓包，因此不宣称 Chrome 后台网络为零。公开 ChatGPT 导航是独立、明确记录的例外，不携带日常 Profile。

## 3. 已执行测试账本

| 组 | 结果 | 正确解释 |
|---|---|---|
| 原有 Node 合同 | 30 + 27 项通过 | 57 项离线合同，不是 57 项真实宿主功能 |
| 原有 Python 检查 | 4 + 2 项通过 | 6 项打包/运行器检查 |
| 新增时间/覆盖/归属/ZIP | 27/27 通过 | 离线逻辑；含 120 个连续 30 日区间、DST、闰日、时区、旧快照、未知和冲突 |
| Chrome 主矩阵 attempt 1 | 17 PASS / 7 FAIL | 保留原输出，包括运行器错误和真实反例 |
| Chrome 主矩阵 attempt 2 | **19 PASS / 4 FAIL / 1 BLOCKED** | 24 个场景；没有把失败断言放宽成通过 |
| 其中既有范围/引用 fixture | 18/18 通过 | C18 内复跑；不是额外 18 个 MV3 或账户认证测试 |
| 定向复验 | 2 PASS / 1 LIMITED | 实际观测两种挂载先后；明确临时 Profile 开发者模式下的重载恢复 |
| 公开 ChatGPT 页面 | BLOCKED | HTTP 403，无登录、无发送、无私人历史读取 |

不把重复运行相加为完成度，也不把测试断言数转换为产品能力百分比。

### 保留并解释的运行器修正

1. 首轮 C11 错误地要求 worker 重启后 CDP target ID 改变。真实 Chrome 会复用该 ID。定向诊断和二次运行记录了 `running → stopping → stopped → starting → running`，并证明内存哨兵消失；不是在 JavaScript 中手造第二个 broker。原 FAIL 和可逆源差异均保留。
2. `Page.setWebLifecycleState` 返回成功，但没有观测到真实 trusted freeze/resume；headless 中切换页面也未产生预期隐藏状态。该项是 **BLOCKED**，不把调用成功算冻结通过。
3. 公开页面首轮分类器漏判 HTTP 403 和中文等待标题，误记 LIMITED。依据同一次原始响应纠正为 BLOCKED，保留原 JSON 和分类源差异，没有重新访问或绕过挑战。
4. C15 裸 CDP 加载环境在 `runtime.reload()` 后变成 disabled。随后仅在新建临时 Profile 开启开发者模式，扩展保持 enabled，显式刷新合成页面可以重新注入。此环境问题不能推广成“Chrome 不支持扩展重载”；旧 DOM 残留仍然没有被抹去。

## 4. R0 逐项裁决

| 项 | 裁决 | 已有证据 | 尚未放行的部分 |
|---|---|---|---|
| R0-00 环境/MV3 | LIMITED | 真 Chrome content script、Shadow DOM、真实 worker 消息、受控撤销、IDB 冷重启保留 | 瞬时 disable/reload 清场、真实冻结、可见窗口行为 |
| R0-01 身份隔离 | LIMITED；真实身份 BLOCKED | 状态机 A/B/A、旧 epoch/错文档/跨范围拒绝，Chrome fixture 清除投影，真实 MessageSender 通过原协议验证 | 没有真实 ChatGPT 账户/组织认证来源；账户选择或标题不算身份 |
| R0-02 历史/发送时间 | LIMITED | v2.7 时间、唯一主题段、父主题旧项、来源/覆盖/未知规则与合成 ZIP 已运行 | 官方导出格式/编辑与分支语义未实测；未建立持续完整历史路线 |
| R0-03 跨 Project 引用 | LIMITED；真实 Project BLOCKED | 同 scope 三类引用、派生标题分离、原始对象不变、跨 scope 拒绝 | 真正原生链接/权限/Project 内容未操作；未合并文件/指令/记忆 |
| R0-04 原生保留 | LIMITED | 合成宿主原节点、草稿/选区/样式/处理器保留，输入/附件/模型/工具/交互/搜索/未知入口仍工作 | 全部真实 ChatGPT 五格功能、物理 IME、实际阅读返回槽位、无残留停用 |
| R0-05 PAIA 共存 | LIMITED；实际 PAIA BLOCKED | 两个独立 MV3 挂载，单独/共同运行，两种真实观测挂载次序、独立退出、输入增高无覆盖 | 没有已明确安全的实际 PAIA 测试构建；未借用日常安装或数据 |
| R0-06 证据/裁决 | GO | 本报告、原生矩阵、架构裁决、原始输出、构建/源码哈希 | 不自动授权或启动 B/C 正式实施 |

## 5. 关键真实反例与架构后果

### 静默路由不是 popstate

原 PR #3 在 `history.pushState` 后 500ms 仍保留旧挂载（C08）。实验变体使用浏览器 `webNavigation.onHistoryStateUpdated`，两次运行分别约 14ms、25ms 撤下挂载（C19）。它没有改写宿主 history，也没有读取内部 ChatGPT 接口。

裁决：**浏览器路由通知可以作为失效信号，不能当作账户证明或新正文已就绪的证明。** 变体只撤销，不盲目重新显示敏感投影。

### 文档换代不能被旧租约卡住

A→B 快速文档导航中，原 broker 拒绝未到期的另一 document，且没有重试（C09）；原生仍可用，但新挂载不出现。这个保守防串线合同不能原样当作正式 document handoff。

裁决：B1 必须加入经浏览器当前 document 验证的换代/撤权及旧响应拒绝；不能靠等待四秒或放宽账户检查来“修好”。

### 原生可用与布局完全恢复是两个指标

原生节点、草稿和原有处理器在受控退出、worker 停止、禁用/重载时仍保留。但实际禁用后 250ms 还有旧挂载，运行中的租约计时器到期后才移除；重新启用并未自动重注入旧页面。正确临时开发者模式下的扩展重载也留下旧 DOM。

裁决：**不隐藏/移动/重建原生正文、输入、模型工具或整个应用根。不要以自动刷新 ChatGPT 作为恢复方案。** 不因活跃事件循环中四秒后能清除，就承诺 frozen/disabled 场景的无条件隐私清场。真实敏感投影和连续导航接管尚不能据此放行。

### 数据历史与时间是核心外部前提

一个可靠的当前段新发送可以证明主题属于当前段；一个旧时间戳或旧导出不能证明其他窗口/设备在之后没有新发送。缺任一相关成员的覆盖证据时，不能确认旧主题段，也不能误藏未知窗口。

官方导出是可审查的批量输入候选，不是已经验证的实时完整历史 API。当前实验未读取任何真实导出，也未确认其中字段等于“原始用户新发送”。详见架构裁决中的渠道表。

## 6. 下一步工程边界

优先进入 **B1 Scope/引用的受限正式实现**：扩展 origin 的作用域仓库、不可变原生引用、经浏览器文档换代验证的 broker、unknown 禁止读写、旧异步提交拒绝、worker 冷启动恢复。它已有底层依据，不需要再做 UI 原型。

B2 的纯时间/覆盖内核可以复用本轮合同；真实导出适配与持续获取不能冒领完成。B3 可在 B1 后推进派生资产/人工意图；B4/B5 仍需各自的并发、迁移与异常测试。C2 原位接管、C5 真实原生回归和 C6 日常闭环仍依赖清洁真实宿主实验。

本轮到 R0 证据和架构裁决结束，没有开始上述正式产品代码。

## 7. 后续最小外部条件

需要用户另行批准：可见的独立 Chrome 测试 Profile；由用户手动登录的两个仅含合成内容的专用账号；A 账号的普通聊天和两个可用的原生 Projects，B 账号的同名对照；明确允许的合成发送、编辑/分支、工具/附件与切换动作；来自该清洁账号的官方导出样本。组织隔离需另有可用的测试工作区，缺失就继续标记 BLOCKED，不要求为此购买服务。

实际 PAIA 共存需要明确路径/版本/哈希、可全新安装且不带日常数据的测试构建。未识别到安全构建不等于断言 Mac 上没有 PAIA。

## 8. 证据入口

`chrome-attempt1.json`、`chrome-attempt2.json`、`lifecycle-followup.json` 是浏览器执行账本；`timefacts-attempt1.json` 和 `inherited-checks/` 是离线结果。`preflight.json` 保留首次真 MV3 加载；`lifecycle-diagnostic.json` 保留 target-ID/冻结诊断；`public-shell*.json` 保留公开页面阻断和纠正。`inherited-source-verification.json`、`BUILD_MANIFEST.json`、`INTEGRITY_CHECKS.json` 绑定基线、源码、构建和证据。

执行脚本及局部依赖锁文件位于 `tests/r0/execution_v27/`，复现入口位于 `experiments/r0/execution_v27/README.md`。本结果只适用于明确记载的环境和数据层级。
