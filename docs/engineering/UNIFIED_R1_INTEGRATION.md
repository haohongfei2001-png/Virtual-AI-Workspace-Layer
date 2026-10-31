# VAIWL Free + Pro R1：统一候选实施与验收说明

本文件记录已实现的隔离集成、复现入口和证据边界，不重新定义产品或创建平行开发计划。候选始终保持 Draft；不据此合并、发布或替换正在使用的扩展。

## 1. 源码与唯一集成位置

| 项目 | 精确来源 |
|---|---|
| 仓库 | `haohongfei2001-png/Virtual-AI-Workspace-Layer` |
| Pro R1 输入 / PR #23 | `5dec17dc275a79b998db6b3ba8d940710337d3b5` |
| 初始 Free 输入 / PR #16 | `2c9b043ce3c65a4b92c6f8f83b59fb416f63132a` |
| 受控同步后的 Free 基线 | `5593e02eb81b1fc8fda3a12dc945d0280cf67d60` |
| 唯一集成分支 | `codex/vaiwl-unified-r1-20261031` |
| 审查入口 | [Draft PR #24](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/24) |
| 合同 | `VAIWL-PRO/1.0`，含原 `R1_CODEC.d.ts` 澄清 |

同步保留双方完整源码与资产，通过双父提交记录 Pro 和冻结 Free 的来源，不改原分支或 `main`，不重写已有历史。Free 后续提交不能未经审阅自动混入本候选。具体受测候选 SHA 由每次 CI 及其 `sourceSHA` 给出；本说明不以文档中的固定成绩覆盖后续源码。

输入 Pro 已独立复现 **443/443，零失败、零跳过**，共享补丁在临时镜像 **202/202**，原 Chromium 连续旅程和性能样本均重跑。两组测试有重叠，不相加。输入报告保存在 [baseline](../../tests/integration-unified/baseline/)；这些报告不属于后续集成 SHA。

## 2. 同一扩展的生产组装

`buildHost({proR1:true})` 选择 `extension/pro-worker.mjs`、`pro-workspace.mjs` 和 `pro-sidebar.mjs`。它们复用原 Host binding service、UiDocumentGrant、Free frame、原生导航、生命周期和共享库连接。原默认构建未启用此选项时依赖图没有 Pro 模块；Free 不依赖会员请求、模型或 Pro 初始化。

统一 frame 内的 Free renderer 保持挂载。切换只改变扩展自己拥有的显示出口，保留当前 Project 范围、历史段、列表分页、展开与滚动。原生聊天、Project、composer、草稿、模型/工具、搜索、导航与唯一四格由原 Host 继续拥有。新增恢复对话框只让扩展自己的兄弟根暂时不可交互，不修改原生 DOM。四格返回复用同一返回例程；返回动作只依赖当前 UI 授权，不因 Free 正在替换快照而错误拒绝。

| 合同接口 | 生产实现与当前能力 |
|---|---|
| `sharedSnapshot` | 原 `ui.withScope` 取得当前 document/scope grant；原 Free prepared snapshot 提供 NativeRef、ActivityDecision、ViewSession、原生/证据/Workspace 版本。私有完整向量不发给 frame，公开状态由严格 DTO 投影。 |
| `evidence` | 仅在明确本地用途许可后准备有界元数据，排除未知归属/过期或被排除输入。未配置获准模型时明确返回不可用。选区、正文、已发送输入没有被额外接入模型。 |
| `commit` | 既有 connection 和同一 DB4 transaction；当前 grant、generation、来源根、Workspace revision、overlay CAS 共同校验。人工 intent 在事务执行边界消费，operation fingerprint 提供幂等对账。 |
| `view` | 原 FreeFrameDTO 与 Pro 分页页/面板/行/搜索。主题、Series、工作线边和操作审阅有界；完整 overlay、完整 inverse 和原始证据留在 worker。 |
| `navigation` | 原 `prepareNavigation` / current navigation owner 核验真实目标与一次 dispatch。原生 href 必须由另一次明确点击打开新标签，保留当前未发送内容。返回锚点与 Series continuation 使用明确来路。 |
| `background` | 原撤文档、撤 mount、撤 tab、stop、idle 钩子。后台处理初始关闭，恢复/升级后暂停；没有生产 provider transport、真实云任务或费用预留。 |

`HOST_UI_PRO` 只走精确消息分派。RPC 外壳检查真实 Chrome sender、原 UI grant、白名单 action、请求大小、期限、取消和生命周期。投影和生命周期的同步异常与异步原生 Promise 拒绝均被处理；异步结果不能被误当同步 `isIdle:true`。生产包不包含 fixture owner/rule model，也不把 scope 字符串、review hash、备份内容或序列化 receipt 当权限。

包内人工 Pro 功能是该显式构建的能力，不代表已有会员服务器或付费资格验证。正式 BrowserLocal 组装沿用现有个人本地绑定：未解锁只作即时只读展示；刷新/换文档/锁定后先清除私人投影，再由新确认恢复访问。此绑定不声称建立 ChatGPT 账户身份，也不把聊天路由当 NONE。已核验源缺失时保留 UNKNOWN 及原生入口。

## 3. 有界交互、操作与原子撤销

公开协议为 `vaiwl-pro-public/1`：每条最多 64 KiB、8,192 JSON 节点、16 层深度；所有嵌套字段严格校验。公开 review 只包含 scope、epoch、overlay revision 和完整私有向量的摘要。页面、面板和搜索回复不能携带 grant、原生 handle、provider map、完整索引或任意对象藏入 scalar 字段。

人工主题、派生标题、明确主/关联、纠错、锁与排除沿用 R1 reducer。结构预览在 worker 保管，五分钟失效、每 session 最多 64 个。应用前检查当前完整版本并消费预览；回复丢失后用同 operationId/同 fingerprint 对账，不能重复派发原生动作或模型。

Series 的完整图留在 worker（既有 2,000 成员/4,000 边边界）；成员与边各自分页。单次有界编辑先在完整图上展开，再复用原 `buildSeriesPlan` / `APPLY_SERIES_PLAN`。调整显示顺序不隐式改变拓扑；移除中间项保留断点；循环、分支标签、scope、成员与锁全部依完整图复查。下一项必须有确切 continuation 边、当前可用引用、仍有效的主题关系与模式范围。

拆分可以遍历全部成员页，保留跨页选择，未选成员留在原主题。操作记录的摘要截断不等于完整审阅；大操作使用逐页变化审阅后再确认整笔 inverse。完整逆操作仍由原 reducer 在一笔事务中校验并应用；后续成员、Series、负约束或来源变化会阻止旧 inverse。不能以部分列表、部分写入或循环多次小撤销冒充原子撤销。

主题合并选择器按页读取主题，跨页及预览返回时保留已选 ID、名称与位置，并复用既有单次最多 100 个来源主题的合同。单条聊天的主主题/关联候选翻页保留标题草稿及未确认选择。Project 范围有独立候选分页，保留所有已选 ID，不能用原生列表当前一页重建选择集；原有 100 项明确选择上限继续有效。历史主关联核对有独立的待确认分页：先过滤已解决记录，再计算页码；解决前页内容不会让后续记录永久消失。所有分页仍绑定当前公开版本，最后确认由 worker 复核完整状态。

拆分选择集仍需放入同一 64 KiB 请求信封（远程正文预留后的限额为 64,512 字节）；极大选择在发送前明确拒绝，需减少该次选择，不能部分提交。单条引用超过 100 个受保护主题关系时，关系面板也会明确拒绝；不以隐藏关系或丢弃约束换取可编辑。这些是当前容量边界，不属于真实设备或许可关卡。

## 4. DB4、备份、升级、修复与回退

注册与深入审计见 [UNIFIED_R1_STORAGE_AUDIT.md](UNIFIED_R1_STORAGE_AUDIT.md)。Pro 不调用 `indexedDB.open()`，不新建平行数据库或提升 DB4。

| 记录 | 命名空间与容量 |
|---|---|
| overlay / checkpoint / journal | `vaiwl-pro-overlay/1`，root 16 MiB，10,000 operations；使用已有 `b23_states` / `b23_checkpoints` / `b23_operations` |
| 安装账本 | `vaiwl-pro-billing/1`，root 8 MiB、1,000 jobs、10,000 operations；真实费用执行关闭 |
| 受审修复证据 | `vaiwl-pro-recovery/1`，每 scope 一个不可覆盖 quarantine/receipt，34 MiB；重放扫描最多 64 MiB/10,000 条 |
| 统一文件 | `vaiwl-unified-assets/1`，最低 reader `vaiwl-unified-r1/1`；沿用 Host 17 MiB 上传边界 |

overlay 的最低数据 reader 为 `vaiwl-pro-overlay/1`，未知 reader/codec 拒绝读写。GC 策略是保留 root/checkpoint、全部 journal/inverse、负约束、恢复原始证据和不确定费用；达到上限拒绝新增写入。没有自动日志压缩或历史裁剪，也不以“清理”删除用户资产。

**统一备份恢复：** 原 Host 的分块备份入口导出 Free + Pro 数据。文件的 checksum 与两部分摘要共同绑定内容，不带 grant、凭据、待执行工作或模型许可。现有同步 enlist 将 Free mutation 与 Pro root/checkpoint/journal 纳入同一 IDB readwrite transaction；任一配额、CAS、撤权或写失败整体回滚。空白目标可恢复，非空目标只合并无冲突资产，相同内容保留，同 ID 不同内容拒绝覆盖。旧 Free-only 文件仍可读取。

**旧资产升级：** Pro 设置中的“检查旧版整理升级”先给预览，再明确应用。仅空白 overlay 可升级，原 Workspace/Placement/Identity 的 ID、名称、别名、顺序、人工锁/排除完整保留。多重关系没有明确 primary 时保持待确认，不取第一项。旧共享资料保留；成功后处理关闭。

**损坏恢复：** “检查 Pro 数据恢复”即使 Pro 正常加载失败也可使用。预览只读；必须由严格连续日志、完整 codec/链、checkpoint 高水位和现有来源 fence 证明完整结果。确认在同一事务中写入恢复 root/checkpoint 及原始记录 quarantine，不修改 journal、Free 或原生数据。未知未来 codec、缺失尾部/中间历史、跨 scope、冲突、过大证据、已占用 quarantine、预览后数据变化或撤权均拒绝。不能恢复授权、自动执行任务或伪造原生归属。

**回退：** 原 Free reader 继续读取自己的 DB4 共享资产，不把 Pro journal 当 Free 操作。回到 Free 只改变出口；保留 Pro namespace。旧 Free-only 备份不含 Pro，因此回退前应保留统一备份。此候选的兼容结论只覆盖同步基线的 reader，不承诺任意历史版本都能读后来的 Free codec，更不要求清库降级。

## 5. 复现与候选包

在精确 checkout 上安装锁定依赖后执行：

```sh
npm ci --prefix extension/tooling --ignore-scripts --no-audit --no-fund
npm ci --prefix tests/b1/tooling --ignore-scripts --no-audit --no-fund
node tests/integration-unified/run.mjs node
node tests/integration-unified/run.mjs package
node tests/integration-unified/run.mjs performance
node tests/integration-unified/run.mjs browser
```

浏览器必须为完整 Chrome，设置 `FREE_CHROME_EXECUTABLE` / `PRO_CHROMIUM_EXECUTABLE`；Playwright 模块路径见 [复现说明](../../tests/integration-unified/README.md)。统一 CI 固定官方 Chrome for Testing 143.0.7499.4 并校验下载摘要。缺浏览器、零测试、skip、CI 脏源码、运行中源码改变或不匹配 `VAIWL_SOURCE_COMMIT` 都不能成为绿灯。

统一正式候选的独立构建命令：

```sh
node extension/package.mjs --pro-r1 /absolute/new-output-directory
node extension/package.mjs --verify /absolute/new-output-directory/extension
```

输出 `vaiwl-unified-r1-development.zip`、`SHA256SUMS`、unpacked 与内部 `build-manifest.json`。权限仍为既有 BrowserLocal 的 `webNavigation` / `storage`、精确 ChatGPT host；没有新增 cookies、debugger、management 或全站权限。测试专用生命周期控制扩展独立于候选，不能打入交付包。WAR 仅包含公开静态 UI 依赖，不公开生产 owner、存储/恢复/账本、模型或私有 controller。

## 6. 精确 SHA 的 CI 与证据分账

| workflow / 证据 | 负责验证 |
|---|---|
| `.github/workflows/vaiwl-unified-r1.yml` | 完整 Node + integrated shared-owner、正式 Free/统一包清单、原性能原始样本、Pro Chromium 连续旅程、远程 UI、实际 IDB、同包 MV3 与 BrowserLocal |
| `.github/workflows/vaiwl-unified-free-regression.yml` | 从原 Free workflow 复制的完整 42 jobs；只改隔离分支触发/名称/concurrency/精确 checkout，原断言与延期规模政策保留 |
| 输入 baseline | 精确 Pro 输入的 443、补丁 202、性能和浏览器复现；不能代替集成候选 |
| CI artifacts | sourceSHA、前后源码摘要、完整日志、包清单、SHA256、浏览器/fixture/oracle 与网络边界 |

原 Free workflow 未被改写。继承的 Free jobs 验证统一源码中的独立 Free 组装；它们不冒充全部运行于 Pro 包。统一 MV3 旅程才验证同一个包中 Free→Pro→Free、人工操作、阅读/返回、结构与撤销、备份、重启、第二 tab、账号替换、实际 disable/reenable/uninstall。来源授权的 loopback profile 使用固定本地认证和原生形状的页面，由生产 owner 消费，未向 Pro 注入 fixture grant。

正式 BrowserLocal 包与匿名页面重放单列：它直接加载未改写 manifest/config 的正式 ZIP，仅由测试路由在精确 URL 返回匿名 HTML，所有实际外部网络均阻断；报告绑定所加载 ZIP 的 SHA256，并将该 ZIP 放入 `formal-tested-packages`。它不建立 server principal，必须明确个人本地解锁。合成页面、固定本地认证、测试中受控注入的损坏字节始终标为测试材料；真实 owner/存储/RPC 路径与实际 Chromium 运行仍可被审查。

报告不能简单相加测试数：原 `--regression` 与完整 Node、继承 Free jobs 存在重叠。性能需同时看 p95、原始样本、环境和源摘要；MockIDB 的开发阈值不代表用户磁盘或 Mac 性能。原 10k/100k 延期目标不因本候选变绿而改状态。

## 7. 必须单独取得的真实验收

| 关卡 | 本候选可以给出的证据 | 仍需的外部条件 |
|---|---|---|
| ChatGPT 原生来源 / NONE / Project / 账户与页面更新 | 生产接线与离线正向/拒绝反例 | 实际受支持 ChatGPT 页面和获准账号；正常菜单/当前来源的真实语义 |
| 本人日用 Mac、输入与阅读现场 | 无损节点、草稿、原生控件、四格返回的合成浏览器断言 | 本人 Mac、物理输入法、实际工具/运行状态与真实资料规模 |
| PAIA 共存 | 独立被动扩展与输入/导航/布局回归 | 实际已安装 PAIA 版本及本人启用功能 |
| worker 自然空闲休眠 | 强制停止、重新授权、完整浏览器重启；统一包另有固定 60 秒、无页面客户端、无 worker 附着的被动观察与重开检查 | 目标自行销毁只能证明无强制退出与恢复，原因未归属时不标自然休眠 PASS；真实日用的休眠恢复仍另验 |
| 模型、费用与真实语义质量 | 默认关闭、预算/协议/拒绝反例、人工模式可用 | 获准目的地/用途/凭据/预算及自然数据评测；不得用 fixture model 替代 |

离线工程通过不自动赋予 `LIVE_VERIFIED`、`FREE_ACCEPTED` 或 `RELEASE_READY`。原生输入、账户权限、资料与 scope 隔离发生任何真实失败时都应回到同一候选修复，不能以模拟结果抵销。个人账号、日用安装、合并和发布未被本轮工程动作修改。
