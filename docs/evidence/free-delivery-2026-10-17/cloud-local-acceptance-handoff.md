# Free 云端结果与本地验收接手记录

本文件是 [唯一开发计划](../../DEVELOPMENT_PLAN.md) 的验收接手记录，不新增计划或修改原退出条件。真实状态以 [STATUS](../../STATUS.md)、各次原始 CI 和本文件注明的源码为准。当前 Free 仍 NOT_RELEASE_READY。

## 1. 同步前提

- 继续现有 `codex/vaiwl-free-first-20261013` / PR #16；不合并 main。
- 首先保存并核对本地已跟踪/未跟踪改动；此前数字后缀 2258 的未跟踪副本保持原样，不删除或覆盖。不得用 reset/clean/force 解决同步。
- 只在云端正式交接停止且本地成果保全后，fetch 并比较实际分支 HEAD。干净且可快进时才 fast-forward；有分叉或未提交修改先核对差异。
- 运行历史 writer/升级合同需要真实完整 Git 历史。缺 `.git`、shallow 缺对象、锁定依赖缺失等记为验证环境错误，不能写作产品测试通过或删掉历史用例。
- 本记录准备时正式代码为 `6122340b8efdbedb35b286c914daf139c02d0a4f`。最终接手以 PR #16 的 `VAIWL_HANDOFF_READY` 评论所列 HEAD 为准。

## 2. 已完成且可复核的云端切片

- B1.F/C2：warm C2 receipt 下的 foreground 传输失效一次性重握手；旧 session 不耗新 session 恢复预算；外层交付前重新检查当前授权。
- B1.F/B4.F：Pro 原交付 `462ff1b` 经独立反例及修订后在 `14f5e94` 整合。无 receipt 等待只接收真实新原生上下文信号，保原 6 秒；共享订阅取消不撤掉其他有效使用者；服务实际交付前不提前退役/退款。原交付不是未经修改直接通过。
- B1.F/C2/B4.F：retained history 的真实成功请求允许一次精确 metadata 重查，旧 epoch 请求不得被改写为当前；不补发原生请求。
- B4.F/B5.F/F1：私有不可变 root/bucket 证明只省重复校验；fresh IDB bytes、checksum、schema、scope 与全量 ordinal 审计保持。Native 当前 GC 工作单收窄、旧 64 行格式完整读取、重复/缺失工作单完整 fallback；Shared delta 历史不削减。
- B4.F/B5.F：旧 checkpoint 入口与逐删除撤权栅栏；已排队旧 bucket 回调在 failed 早退前检查 owner。Native/Shared 六 store 的提交前损坏/取消/失权回滚，纯旧数据损坏的保守容错及真正提交后 stale 语义分别覆盖。
- F3：manifest 权限、执行入口与 WAR 独立验证；整个 `src/runtime/`、worker/bootstrap/compiled runtime 保持私有。含糊路径按保守不支持处理，不冒称所有形式均有 Chrome 利用证据。
- 新安全批次本地完整 Node 8169/8169，0 fail/skip/cancel；原 12 guard 变异全 KILLED。额外 queued-callback 8 个精确变异全部 KILLED。MockIDB 证据为 L，不代替真实浏览器耐久。

## 3. 原正式 10k：如何复现与解释

以 `.github/workflows/free-offline-host.yml` 的 “Formal Host 10k single-project membership sample” 步骤为唯一正式命令和退出判定来源。运行前使用原锁文件安装依赖、记录实际 Chromium/OS/Node/CPU 环境与源码；只用新隔离测试 profile 和原合成 fixture。

原命令是：

```sh
FREE_SOURCE_COMMIT="$(git rev-parse HEAD)" \
HOST_SCALE_RUN=1 HOST_SCALE_SIZE=10000 \
HOST_SCALE_DISTRIBUTION=single-project HOST_SCALE_CPU_RATE=1 \
node tests/host/host-scale-package-browser.mjs "$RUNNER_TEMP/host-scale-10k-project.json"
```

`RUNNER_TEMP` 应为实际可写临时输出目录，`FREE_CHROME_EXECUTABLE` 应为已核实的测试 Chromium 路径。此处不授权操作日常浏览器或使用真实账户数据。

- runner 的 exit 2 / `PARTIAL_SYS04_NOT_ACCEPTED` 是预期的有界场景结果，不能单凭退出码或 job 绿色判定全产品通过；必须同时执行 workflow 的原 JSON 判定。
- 核对原 30 秒内 `nativeMemberProgress.status=OBSERVED_COMPLETE_INDEX`、`stableSamples=2`、两轮完整 10000 refs/21 页、同 revision、零缺失/重复/UNKNOWN/错属。其后 `measurement.before/after` 的完整审计也必须同 revision。
- 核对 `sourceCommit`、全部 source/fixture hash、运行期间源码/包不变、cleanup 无错；保留完整 JSON、原步骤结论与日志。
- `742968e` 的 CI [39077084574](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/39077084574) 本次原门槛 PASS：rev216、双完整审计后余 6223.385ms，测量前后同 revision。仅一个合成场景样本；搜索/翻页单次耗时不是 p95。
- 最新代码 `6122340` 的 CI [39078312525](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/39078312525) 再次正式 FAIL：全 10000 refs/rev206，首轮 21 页完整审计通过（3028.390ms），第二轮已开始但未在原期限结束。Node、journeys、J4 通过；源与 fixture hash 精确匹配。故截至此源码，跨环境 10k 仍 OPEN，不能将742的单次PASS转写为当前稳定通过。
- 之前 `2f9905e` 的 CI [39074537965](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/actions/runs/39074537965) 虽全 10000、首审通过，第二审未在原期限完成，仍 FAIL。更早 6230/5871/8125/9145 等失败同样保留，不选最好成绩替代稳定性。
- 原单大 Project 样本通过不关闭 F1 的 1k/10k/100k、mixed/none-heavy、多 tab/4x/弱设备、p95 或跨环境稳定性。不要无改动反复跑到绿色。
- 仅在正式失败后，使用 workflow 已有有界双 CPU/phase 诊断。采样在另一次合成运行中，不能抵消正式 FAIL；跨 realm 时钟只有相关性边界，drop 必须披露，idle 不等于纯 IDB 时间。

## 4. cold / worker / peer：分开复现，不伪造上下文

命令与最终断言继续取同一 workflow，各模式输出分开：

```sh
node tests/host/context-package-mv3-browser.mjs "$RUNNER_TEMP/context-cold.json" cold
node tests/host/context-package-mv3-browser.mjs "$RUNNER_TEMP/context-cold-trace.json" cold-trace
node tests/host/context-package-mv3-browser.mjs "$RUNNER_TEMP/context-cold-recovery.json" cold-recovery
node tests/host/context-replacement-package-browser.mjs "$RUNNER_TEMP/context-transport-expiry.json" transport-expiry
node tests/host/context-replacement-package-browser.mjs "$RUNNER_TEMP/context-transport-expiry-mutant.json" transport-expiry-mutant
```

- cold 未插桩正式样本与 passive diagnostic 副本分账。此前 23385/2f 的唯一真实 GET 分别早于 listener 124ms/29ms，未有 receipt，`current-context-unproven` 安全拒绝；742 的两样本通过不抹掉该时序。
- cold-recovery 只有实际进入 cold 失败再由真实新原生导航恢复的分支，才覆盖该回退；若初次冷启动就成功，记录该回退未覆盖。
- warm `transport-expiry` 必须证明原 worker 仍在、真实 C2 receipt 有效、唯一原生 GET、不新增请求、新 grant 与真实 post-focus VIEW，并保持原文档/editor/draft。精确 mutant 必须在同 worker/原 15 秒窗失败，不能用 owner 已丢失或 teardown 后状态冒充检出。
- 完整 J4 仍按现有 job 的前置、原旅程和各独立中断/codec 分支顺序跑。`PARTIAL_J4_NOT_ACCEPTED` 以及未覆盖组合必须保留。
- worker 内存彻底丢失后的 peer **自动 foreground 恢复仍 NOT_ESTABLISHED**。新原生 GET 后重新认证的恢复和仅 foreground 恢复是两个结果。不能从旧 frame、缓存 scope、nonce、页面宣称 verified 或持久化旧授权补造 C2 receipt。
- 无 receipt 的恢复策略不会自行发送原生请求。真实新信号仍缺失时，本地需要建立可验证的宿主/浏览器事件因果，而不是增加轮询、延长期限或降低新 grant+VIEW 断言。

## 5. 仍未关闭的原计划退出条件

| 原计划归属 | 当前可声称的范围 | 本地/后续仍需的真实证据 |
| --- | --- | --- |
| B1.F/B2.F1/C2，FREE-MAP | 合成真实 MV3 的有界来源、context、P/C/NONE/UNKNOWN 路径 | 指定获授权 Profile 与账户/context 的可信关联；真实 C1/C2/C3 字段和默认 personal 语义，不能仅靠标签标题认定 |
| B2.F2/F3/B4.F，FREE-ACTIVITY | ACK/原始时间/观察锚/continuation 的实现与相应合成切片 | 真实本人 ACK、无原始时间样本、旧样本/自然跨端变化与延迟，按原 6 秒/30 秒/12 请求/2 重试预算记录 |
| C2–C5，FREE-EXPERIENCE | 已有 J1–J4 部分离线链及独立正反合同 | 原生五格、物理 IME/真实输入、完整支持 profile/视口/生命周期组合、唯一四格返回与实际 disable/uninstall 退出 |
| B4/B5/C6 | 本批权限/损坏/回滚回归及已有恢复切片 | J4 原 remaining 中的组合、re-enable 稳定、真正 worker-loss peer foreground 证据；不能把 23 步 PASS 当完整 J4 |
| F1 | 一个 742 原正式 10k 单大 Project 样本通过 | 跨环境/规模/分布/多 tab/4x/弱设备及 p95 原指标 |
| C6/G1/F3/F4 | 构建/权限/闭包和独立合成资料 | 实际 PAIA 共存、日常/跨日/设备记录、完整 81 项适用子场景与 G/U；发布仍需其原许可 |

真实 G/Profile、物理设备、日常/跨日与实际 PAIA 共存均不可由云端合成结果替代。缺条件的项目写 BLOCKED/NOT_RUN；其他已有历史证据保留原源码/环境归属，不按测试数量计算完成百分比。

## 6. 交接记录边界

最终 HEAD、最后实际 CI、已完成文件与剩余问题由 PR #16 的 `VAIWL_HANDOFF_READY` 评论确认。此文档准备完成不表示云端已停止，也不表示本地已同步、Free 完成或批准发布。

## 本地接手实测（2026-10-18）

已读取正式交接评论6243137598并fetch，实际本地/远端均为bdab510，无分叉、无已跟踪未提交修改；8d372e0为祖先。2258个未跟踪副本逐文件SHA256、tar及工作区清单已保存在本机临时检查点，原件未修改，后验全部一致；既有stash保留。

原CI39078898821日志与提取JSON归档为 `local-takeover-ci*`：两次10000/21页/rev207完整审计、余1748.308ms；等待第17条时1371.615ms超时，RPC尾部仍preparing，未进入measurement。不是丢成员，也尚无证据证明renderer race造成该次FAIL。

本机原HEAD先因未安装的1248路径启动失败（保留原件），已安装的Chrome153原速及4x各一例完整旅程通过；随后安装锁定Chrome156，与CI版本一致，原HEAD原速完整旅程仍通过，双审计后余21247.783ms。167生产/26fixture hash与CI完全相同；不能把本地PASS抵消Linux FAIL。4x仅为既定runner页CPU节流，不宣称整机/worker弱设备认证。

成员展开另发现确定性renderer竞态：pointerdown期间排队旧5条DTO，pointerup后click发17条请求，旧flush推进请求代际，后来ready被错误丢弃。独立两正例原RED、三安全对照PASS；现在只丢同scope/session/segment中已被新请求超越的排队paint；新scope/session/segment与即时背景fence保持。独审补Enter/Space、reply先于timer、pendingRender等后10/10通过，相关295项通过。此为L层直接反例，完整MV3旅程不是该竞态的指定变异证明。

候选同Chrome156原10k完整闭环通过，revision201、10000 PROJECT、零UNKNOWN/缺失/重复/错属，双审计后余19878.934ms，17成员展开、测量前后同revision、原生导航与唯一返回通过。唯一生产差异为navigation.mjs，fixture相同，源/fixture/manifest运行中无漂移、隔离目录清理成功。报告sourceCommit为基线bdab510，候选精确源码以local-takeover-validation.json及各报告sourceHashes为准，不冒充未修改的bdab510。原HEAD/候选摄取观察21145.232/19357.654ms仅单次描述，双审计余量并未改善，不宣称性能提速。Linux预算根因及跨环境稳定性仍OPEN。

冻结候选完整Node8179/8179、0 fail/skip/cancel，85.510秒；548测试文件，既有tracked输入运行前后摘要一致，新反例文件摘要另列于local-takeover-validation.json。未修改共享schema、恢复/授权栅栏或包公开边界。

## 2026-10-18 本地持续实施（e1b0bfd 后续候选）

已读取 CI39083660931 正式10k/J4原日志与JSON，比较同HEAD/Chrome156的本地结果。Linux10k首轮审计完成、第二轮超时；J4 peer新原生导航仍失败。本地J423步通过但仍PARTIAL，自动foreground未建立。原失败没有改判；详见 [证据索引](local-ci39083660931-evidence-index.json) 和当前 STATUS。

吸收PR18的3文件运行器增量并补worker网络隔离；真实运行发现禁用send候选对象仍被普通body观察调用的产品缺陷。两处自动observe按原配置守卫，未启用send/metadata权限。独立原实现反例失败，候选4项和343相关测试通过，原片段保存→搜索→原生返回定位→改文拒绝→删除六场景通过。新测试进入现有journeys job，不增runner、不启缓存/上传。该修复不宣称解释Linux10k或J4。

本轮真实Profile受限读取连接超时，当前context仍未验证。没有新增私人数据上传或原生写入。保留2258数字副本与原stash，继续原本地目录/Free分支/PR16。

最终冻结完整Node8214/8214（100.88秒，0 fail/skip/cancel）、12/12护栏变异KILLED，输入摘要不变。首轮95.86秒含一项CI场景清单遗漏FAIL，修正后复验；上一批85.51秒，仅报告实测、不宣称加速。原片段浏览器生产/runner摘要与最终候选完全一致。

同源码f29443a的CI39086077996已结束：Linux片段六场景通过、生产与runner摘要同本地；Node/journeys通过。J4仅原门禁通过，仍PARTIAL；正式10k tail待定/audit0超时，失败后库存10000不冒充预算内完成。原JSON及日志见[本次CI证据](local-ci39086077996-summary.json)。

2026-10-18 连续本地候选：仅隐藏目录让行与成功mount/wake后的armed foreground消费；稳定RED及修复原件保留。原版/候选同环境10k均完成双审计与返回，摄取17.120→18.391秒，不能宣称改善。Linux10k、自动peer恢复仍待真实结果，真实Profile连接/IME/PAIA/跨端缺口不变。

本批冻结结果：Node8227/8227/108.45秒、12护栏变异全KILLED，输入未漂移；首次诊断锚点3FAIL保留并修复。最终10k双审计rev203/10000正确PROJECT/零UNKNOWN、原窗口剩12.93秒，导航返回通过；Node并行下总观察48.61秒不作速度比。J4仍23步PARTIAL，自动foreground失败，新原生GET恢复不替代。见[本批证据](local-ci39086077996-scheduling-summary.json)。

48dd920远端CI39087927722终态FAIL：Node/导航通过；J4原门禁通过仍PARTIAL、自动foreground失败。正式10k双审计rev206/10000正确PROJECT后只余819ms，在project-card-member-rendering超时；诊断双审计rev205后余58ms返回失败。门槛不变，未进入measurement。见[本次CI原证据](local-ci39087927722-summary.json)。C2-only的worker receipt丢失不能用fresh roster/旧cache恢复peer scope；需合法当前context证明，真实Profile连接仍是对应缺口。

2026-10-18 自动休眠入口实施：**B4.F/UI-11自动关闭闭环候选已落地**：原有休眠release/wake引擎缺少产品自动入口；现复用原链，在已证明C3配置、双surface关闭ACK、队列排空与明确clear输入风险后提供一次机会。busy/失败不循环重试，默认真实profile和C2-only不启用；无scope扩权。独立RED同时发现风险token观察失效后可复活，现永久锁存失效。冻结Node8256/8256、零fail/skip/cancel，实测204.81秒（上批108.45秒，不声称提速），输入未漂移；12护栏变异全KILLED。隔离Chrome156自动路径不用测试关闭API，清空两frame私有根，脱离调试的60秒窗口内原worker销毁，唯一返回后新worker与原frame/editor恢复，3项观察通过；naturalWorkerSleep仍NOT_ESTABLISHED，真实宿主NOT_RUN，不等于完整UI-11/J4或Free验收。[精确证据](local-automatic-dormancy-summary.json)。

- **f3af526 CI39089811164原正式10k完成一例Linux闭环**：四job通过；10000正确PROJECT、零UNKNOWN/遗漏/重复/错属，双审计rev206后原窗口剩8387.63ms，17成员展开、测量前后同revision、原生导航与唯一返回通过；总摄取观察26947.92ms。未降低门槛、未重跑挑绿。仍PARTIAL_SYS04_NOT_ACCEPTED，单例不证明稳定性/p95/完整F1，原FAIL保留。J4仍23步PARTIAL、automatic foreground NOT_ESTABLISHED/current-scope-timeout；原门禁绿色不冒充恢复通过。此CI不含后续分页候选。[原证据](local-ci39089811164-summary.json)。

- **原offset全审计成本已减少，门槛不变**：每页保留全部bucket、scope/root/marker、跨bucket ordinal、容量与完整manifest尺寸校验，仅避免构造/编码整个目录；numeric合法ID回退旧顺序。header＋IDs捷径在同revision损坏反例中漏检，已否决。实际10k读取次数不减，21次完整目录编码降至0（仍逐key算尺寸）；所有facts/成员/顺序一致。隔离真实IDB AB/BA/AB中位919.0→744.9ms，约18.9%改善，仅该读取环节，非Host/p95/Linux认证。冻结Node8277/8277、191.76秒、输入未漂移，12护栏变异全KILLED；本地原10k完整双审计rev207/10000正确PROJECT、剩7876ms，展开/测量前后同revision/原生返回通过。此候选远端待验，不覆盖f3af526或历史FAIL。[同源码证据](local-page-selection-summary.json)。

- **7c676ec原100k混合场景仍FAIL，不能用10k或局部加速外推**：原即时返回旅程在pre-measurement-audit仅有1000 Project/138 refs（138 UNKNOWN）、99862 missing，rev16，性能samples=null；总摄取观察21420.80ms。源/fixture/manifest稳定、隔离目录已清理；没有放宽时间/缩样本/提升UNKNOWN。瓶颈关口在完整原生库存尚未摄取，未进入完整索引分页性能测量；并非上述真实IDB21页读取改善已解决100k。原失败继续保留。[同源码失败原件](local-page-selection-summary.json)。

100k单项目原可见成员场景亦FAIL于30秒共享窗口，未启动任何完整审计。最后tail rev91/total4081，仅代表尾项已观察；失败后root rev93/4190refs不是预算内完成。成员观察段记录12.257秒，整个共享窗口此前已消耗约17.74秒于导航/原生呈现及检查，尚不能把这些时间全归因某一产品函数。两场景均不构成完整100k/p95验收；不重复原样运行挑绿，下一步须有具体摄取/阶段成本证据再改代码。

2026-10-18 当前分页候选a8752ff已正常推送并完成CI39091870975：四job成功；原正式10k双完整审计rev207/10000正确PROJECT，原窗口剩8058.97ms，展开/测量前后同revision/原生返回通过。J4仍23步PARTIAL、自动foreground未建立，不以新原生GET恢复替代。完整F1/p95、100k、真实Profile/IME/PAIA/跨环境关口仍开放。100k阶段诊断将后续定位缩小到共享引用登记回调与事务收尾，原失败和丢弃记录说明见[当前证据](local-page-selection-summary.json)。
