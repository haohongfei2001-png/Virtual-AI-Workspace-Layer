# F1 恢复同步与真实 100k 工程验收

2026-10-12。**当前 Mac 隔离合成 Chrome 范围：PASS。** 本轮从 `e626e3a936279cca625070509733c5178338b8ca` 的真实本地历史继续，解决 100k 客户端 WAITING 与大规模人工更新阻塞；没有重建 B1–B4、替换既有导航或变更原 v2.7 产品目标。运行时提交 `b7a56817056a93add0116a2b13c2b41e9aa6d28d`；随后只修正回归批处理入口及保存最终文档/证据，完整交付 SHA 以 F1 分支 head 为准。

## 交付和恢复

| 模块 | Draft PR | 分支 | 真实提交/父分支 |
|---|---|---|---|
| C3/C4 | [#11](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/11) | codex/vaiwl-c3-c4-context-20261012 | 38ea47dbd85a51951c3b5dbd283d2b088288b3f4；base #10 B5 |
| D1/D2 | [#12](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/12) | codex/vaiwl-d1-d2-offline-20261012 | 3afaf33f99de45a793c0acf3c953d5255c66b4e5；base #11 |
| F1 | [#13](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/13) | codex/vaiwl-f1-performance-20261012 | 本分支最新 head；base #12 |

普通 HTTPS 再次有界失败（`https-push.json`）。用户明确授权的 Git Data API 替代通道已实际恢复同步：`tools/git-data-sync.py` 从 `git cat-file` 读取真实对象，对返回 blob/tree/commit SHA、tree entry 与父子关系逐项比对；完整对象确认后才创建或非强制前进 ref，写前再次检查远端 head。所有阶段 API receipts 保留。没有逐文件模拟开发、重建提交、reset、rebase、丢弃文件或 force push；#7–10 和 main 不修改。原分支与五个原完整 bundle 均已核验，新增完整历史 bundle 位于非临时 `/Users/hhf/Documents/Codex/VAIWL-Development/recovery/`（详见 `RECOVERY.md`）。

恢复工作树：`/Users/hhf/Documents/Codex/VAIWL-Development/c1`；不是 app 中干净的 main checkout。在该目录先 `git status`、`git log -1`、`python3 tests/f1/verify-current-evidence.py`；只有工作树无冲突才按原计划继续。此核验只读，不启动浏览器。旧 `verify-evidence.py` 针对历史 801595e 档案，不适用于本次新运行时。未来推送必须检查实时 head，不覆盖其他执行者。

## 根因与结构性修复

原失败 `profile-100k-before/results.json`：巨型状态约 105,619,112 JSON UTF-16 码元；完整 snapshot 约 156,319,489 码元。worker 的哈希、验证、投影与消息传输叠加，客户端约 6001ms 超时并始终 WAITING，没有 `navigation.update`。提高旧表/JSON 上限的临时诊断曾真实失败，不能算通过；正式验收没有这些改动。

新大规模布局在**同一 v2 IndexedDB、同一原 stores**中存不可变引用分片及带校验和的 scope/revision manifest。分片各自复用原 state 验证（旧表 20,000 行和 16Mi JSON UTF-16 码元上限不变），manifest 同样受 16Mi 上限；新布局有 100k 引用/128Mi 聚合 JSON 码元上限。每个 IPC 页最多 5000 引用、16Mi UTF-8 字节；一致的 scope/generation/revision 才允许一次发布完整视图。旧布局仍用于小规模并通过原回归。新的 aggregate 布局支持大数据，并不是把旧巨型 state 的护栏放宽。

写入加载受命令影响的引用，继续调用原 `reduceCommand`、全局 revision/CAS、幂等/人工日志/撤销，分片、manifest、检查点、操作收据在原原子事务内共同提交。增量变更最多保留64步；缺历史则重新有界读取。迁移保留最新人工版本与撤销状态；重复初始化不能覆盖已发布人工数据。

4x CPU 反例真实输入停顿约 3149.8ms。CPU profile 指向全量投影、URL 解析及 Map 复制，不能只归因于 GC。相同投影/校验生成器每512项协作式让出；人工小变更只重新投影完整受影响主题，来源撤销/时钟/上下文改变仍完整重算。同 scope 且引用/成员顺序未变才复用私有路由索引；最终再 CHECK 当前权限和 revision。窗口选择按需200项，不构建100k options；主页/搜索继续既有导航。原生 input、消息和工具从未重建。

人工写入临近 lease 到期时，先读式 BIND 并核验同 scope 的最新状态，再发送一次写入；保留原 CAS，冲突仍保留草稿并要求人工显式重试。**6 秒请求期限、20 秒 lease 不变，不自动重放写入。**

## 当前真实结果

环境：macOS 27.0 / 26A428；Node v26.8.2；Python 3.14.7；Playwright 1.63.0；Google Chrome 154.0.8037.99，实际路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。全部为新 headless Profile、实际 unpacked MV3/extension-origin IDB、自建 loopback 合成宿主与本次自建 CDP；未接入日常 Chrome、真实 ChatGPT 或 PAIA。临时测试构建只有静态测试导入、特权合成注入/损坏与时序；执行 build/source SHA 全部保留。

| 套件 | 结果 | 原始证据 |
|---|---|---|
| Node 全量（其中 Mock IDB 明确标识） | 160/160 PASS；0 skip | node-final.log |
| Chromium DOM（fake router/sender + mock IDB） | 49/49 PASS，不是持久化证明 | dom49-correct-driver/results.json |
| 旧原生 IndexedDB 合同、迁移/恢复 | 54/54 PASS | regression-final/db.json，逐项 actual.results |
| 新布局原生扩展 IndexedDB | 20/20 PASS | native-partition-final/results.json，逐项 actual.cases |
| 正常页面 / MV3 | 17/17、19/19 PASS | regression-final/page.json、mv3.json |
| C1 / B5 / C3-C4 / C5 | 10/10、3/3、3/3、2/2 PASS | regression-final/c1、b5、c34、c5 |
| B4核心 / 真隐藏、freeze/resume与SPA | 5/5、1/1 PASS | regression-final/b4-core.json、b4-lifecycle.json |
| 完整100k MV3增量旅程 | 9/9 PASS（包括当时18原生分区合同，后补20项单独通过，不重复累加） | large-journeys-locator-boundaries/results.json |
| 1k / 10k / 100k 性能 | 每规模独立20导航/10搜索样本 PASS | performance-1k-final、performance-10k-final、performance-100k-final |

所有规模均保留原120主题/604引用，再追加至完整目标规模；100k A、B分别真实持久100000引用。远端 F99999 真正打开宿主消息/输入、刷新及新tab保留人工标题。两个真实独立数据库连接 CAS 只有一胜；多标签页安全观察更新、保留未保存意图并显式解决冲突。远引用移动/撤销、实际文件下载/dry-run/恢复撤销、工作集依赖、损坏恢复后的旧证据/收据失效逐项通过。

| 规模 | 实际初始化写入 ms | 特权整库诊断 snapshot ms | 导航 p95 ms | 搜索首屏 p95 ms |
|---|---:|---:|---:|---:|
| 1k 旧布局 | 180.7 | 46.5 | 34.2 | 33.3 |
| 10k 旧布局 | 1494.9 | 497.3 | 33.2 | 32.3 |
| 100k 分区布局 | 25280.3 | 8137.1 | 36.0 | 32.5 |

100k 全量诊断 snapshot 仍约8.1秒，是 privileged fixture 检查，**不在客户端6秒 RPC 路径**，不宣称整库重算瞬间完成。公开客户端走有界页/增量，每个成功观察到 RPC 最长1340.6ms，页最大5,750,807 UTF-8字节。实际客户端完成完整数据装配并导航，而不是把 worker 返回ok视为完成。

4x renderer CPU + 原生160消息长聊天 + 同时人工更新：导航p95 **137.4ms**、搜索p95 **74.8ms**、16ms原生输入计时器最大间隔 **43.4ms**；input/draft/transcript/range/message节点及值保持，20/10样本和150ms/300ms阈值未降低。这是受控 CPU 压力模型，不冒充在另一台物理弱设备上的证书。100k 是完整引用与发送/覆盖元数据；宿主消息按实际打开的引用惰性生成，不声称预加载100k长聊天正文。

worker trace 有真实 `stopping → stopped → starting → running`，不同 boot `38114ba2-ba1d-4b1e-b15a-f75d851be7b3 → dfc36cff-202b-499f-bb3b-a94f7c156ca3`；前后 document ID 相同，未刷新，原生节点及人工数据恢复。另实际等待超过20秒并记录新lease。详见完整旅程第4/5项，不以 stopWorker 命令返回或页面重载冒充重启。

## 失败原件与安全边界

| 原件 | 实際失败/原因 | 修复或结论 |
|---|---|---|
| profile-100k-before | 6001ms request-timeout，无客户端应用 | 分片+有界传输+完整版本校验 |
| partitioned-100k-first / batched | 初版1000分页初始化FAIL；5000页后导航约290ms FAIL | 5000有界页与当前URL索引 |
| partition-ingestion-collision-before.log | 跨ref全局evidence ID错误允许覆盖 | 读取既有locator并交回原reducer拒绝冲突，PART13 |
| partition-delta-order-before.log | delta删除重插改变规范引用顺序 | 依manifest顺序，PART16；PART17差分对完整投影 |
| missing-root-before.log | root丢失但可信历史仍在，被误判空库 | 两种布局均corrupt-record，恢复最新人工，PART18 |
| large-journeys-after-collision / cooperative；各 input-profile | 4x输入3秒级及后续184/159ms等真实FAIL | 影响主题增量、同scope索引复用、有界复制/校验；当前43.4ms |
| large-journeys-complete-candidate | lease尾写入已提交，client失效反馈未知 | 写前只读renew+核验，不自动重试写入 |
| large-journeys-first、after-driver、binding-renewal等 | 测试包漏依赖、helper过早close、CAS前置等待/DOM检查到使用竞态 | 修复测试驱动，原失败不删；保留真实冲突断言，locator调用实际按钮，不重试导航/减样本 |
| regression-final/dom | 批处理误选旧B1只读38项驱动，全部不能提供B23服务 | 仅改入口为tests/b23/view-browser.py；原0/38 FAIL和batch exit1保留，正确49项完整重跑PASS |

新20项真实IDB合同还验证实际native put抛QuotaExceededError与put后AbortController撤权：原native事务回滚，无manifest/分片/检查点/成功收据半提交。配额测试是明确故障注入，不是填满Mac磁盘。旧视图损坏独立处理；缺root保留人工历史；来源撤回不再复活。

备份是真正下载的、完整**人工资产及其引用依赖**的有界文件，示例30,947字节，包括远引用标题/归属/工作集；不含执行授权与原证据。不是全部100k bootstrap证据镜像或无限无损备份：人工导入/备份仍受旧20k表、16Mi状态、17Mi文件解析限额，超限安全拒绝。损坏root可由可信checkpoint+最新人工日志恢复；如果不可变piece连同检查点共享数据也损坏，或人工日志无法验证，则安全拒绝，保留原件/完整可读人工piece用于外部备份，不覆盖成较旧成功。PART20覆盖此边界。特权整库诊断与未使用的大型legacy LIST_REFS API不纳入所有RPC均常数时间的主张。

## 视觉与原设计

已实际查看当前真实 Chrome 截图：同尺寸原型/实现、窄屏、深色、历史展开及100k搜索长聊天。主题标题栏/线条图标、左树形连接/旧窗口入口、静态卡片及卡片列间距沿用批准v2.7；顶部/底部真实合成宿主工具和输入占用仍是原C1已记录的宿主适配差异，未为性能重设计产品。窄屏工具不遮挡，深浅色层级完整；唯一阅读返回、30个当地日历日、当前无向上箭头、历史连续空段、未知可达仍由原回归验证。原HTML SHA未变，详见 [C1差异记录](../c1-fidelity-2026-10-12/DIFFERENCES.md)。

截图：[桌面](regression-final/c1/desktop.png)、[窄屏](regression-final/c1/narrow.png)、[深色](regression-final/c1/dark.png)、[历史展开](regression-final/c1/history-expanded.png)、[长列表](regression-final/c1/long-list.png)、[100k远窗口阅读](large-journeys-locator-boundaries/100k-far-native-reading.png)、[100k并发输入](large-journeys-locator-boundaries/100k-4x-long-chat.png)、[恢复后人工标题](large-journeys-locator-boundaries/100k-recovered-human-unknown-evidence.png)。

## 实际命令与覆盖矩阵

在持久工作树执行（所有out为新的目录，Chrome测试顺序运行）：

```sh
node --test tests/**/*.test.mjs
.venv/bin/python tests/f1/real-large-journeys.py docs/engineering/f1-recovery-2026-10-12/large-journeys-locator-boundaries
.venv/bin/python tests/f1/real-large-journeys.py docs/engineering/f1-recovery-2026-10-12/native-partition-final --native-only
.venv/bin/python tests/f1/real-performance.py docs/engineering/f1-recovery-2026-10-12/performance-1k-final 1000
.venv/bin/python tests/f1/real-performance.py docs/engineering/f1-recovery-2026-10-12/performance-10k-final 10000
.venv/bin/python tests/f1/real-performance.py docs/engineering/f1-recovery-2026-10-12/performance-100k-final 100000 --partitioned
.venv/bin/python tests/f1/run-regressions.py docs/engineering/f1-recovery-2026-10-12/regression-final
.venv/bin/python tests/b23/view-browser.py --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out docs/engineering/f1-recovery-2026-10-12/dom49-correct-driver
python3 tests/f1/verify-current-evidence.py
```

顺序批处理中逐条实际命令/耗时/退出码见 `regression-final/batch.json`；其DOM入口失败被上面正确49项重跑取代，未伪改原batch。全部 accepted run 的准确 `argv`/源码/build SHA在 `FINAL_RUNS.json` 及各results；完整原失败、当前源文件、构建、原始截图文件 SHA256 在 `FINAL_SHA256.json`，核验输出 `final-verification.json`。

| 功能 | 通过证据 | 范围/待项 |
|---|---|---|
| v1→v2与旧layout→分区迁移 | 旧native54、PART10 | 同原DB与stores；非真实host迁入 |
| 原120/604、1000/10000/100000 | C1、PART01、每规模20/10samples | 完整元数据、不缩样本 |
| CAS/幂等/撤销/权限与写入失败 | 旧合同、PART02/03/04/13/14/15，100k多tab | 无自动写入重放 |
| 多标签页人工更新/冲突/工作集 | C34、B4、100k完整2/3项 | 草稿保留、显式重试 |
| 分页/增量版本一致性/顺序 | PART05/16/17/19，实际boundedTransport | 不能混revision发布 |
| A/B/unknown、异步及原生节点 | B23、C1、B4、100k6/7项 | 合成身份；生产resolver未获授权 |
| worker真实stop/boot、20slease、隐藏/SPA | B4 core/lifecycle与100k4/5项 | 全新headless Chrome实际事件 |
| 备份/dryrun/损坏/最新人工恢复 | B5、PART07/09/11/12/18/20、100k3/8项 | 有界人工资产；共同piece损坏安全拒绝 |
| 长聊天/主题多/单主题长列表/无障碍 | 160消息、120主题、C1长128列表、真实200%/键盘 | 4x压力已测，物理弱设备/物理IME/真人可发现性未测 |
| 原v2.7视觉/唯一30日导航 | C1十旅程、当前真实截图 | 未重新设计核心规则 |

## 原 A–G 后续依赖裁决

已重新逐项核对原 [DEVELOPMENT_PLAN](../../DEVELOPMENT_PLAN.md)，见 [STATUS](../../STATUS.md)。B1–B5、C1及C2–C5当前合成可独立部分，C3/C4、D1/D2离线合成与F1本机压力档都已实现并有实际证据，不再重做。

仍未完成：A/R0真实host及C6/PAIA共存需要清洁ChatGPT与PAIA独立授权；D1/D2质量认证需要独立自然语料标注与真人标题接受/收益证据，当前模板合成1200条、16.67%覆盖/40 holdout预览不能代替98%目标；D3可选模型质量/资源前置未满足，不强开；D4费用与外传未授权，D5依赖C6真人；E真实原生写入、F2同步服务/密钥、F3发布/渠道/生产兼容、F4长期候选和G1双方协议均未满足依赖或授权。G2现有研究不重复，真实用户资格不是合成可证明。物理弱硬件、物理IME、无字导航真人发现性需要独立设备/真人环境。

当前环境与授权下、原计划依赖已满足的可实施任务已完成。停止在这些真实边界，不宣称 A–G 全产品生产完成，不启动未授权服务/真实账户/写入/PAIA，也不承诺会话结束后仍有后台开发。PR全部保持Draft、未合并、未部署。
