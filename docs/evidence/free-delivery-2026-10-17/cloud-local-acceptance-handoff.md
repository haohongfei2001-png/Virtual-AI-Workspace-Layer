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
