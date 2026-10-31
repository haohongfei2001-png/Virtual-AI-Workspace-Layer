# VAIWL Pro R1 工程候选

合同：**VAIWL-PRO/1.0**。执行依据：交接包 `SECOND-PRO-START.md`，主稿明确语义优先于类型、场景和视觉。该目录是独立 Pro 语义层、可运行界面及共享 owner 的可选适配代码。

**P0–P3 的隔离工程已实现；实际产品来源、共享宿主集成、真实用户验收和发布仍是独立关卡。** 现有扩展入口没有导入此目录，真实模型默认关闭。

## 基线与范围

- 仓库：`haohongfei2001-png/Virtual-AI-Workspace-Layer`。
- 开始时复核 PR #16：`codex/vaiwl-free-first-20261013`，交接 HEAD `f317b26ea6ed7d1cc249c4bfc0ad90a619d29417`。收口时发现新增恢复文案提交，独立候选已快进至最新基线 `2c9b043ce3c65a4b92c6f8f83b59fb416f63132a`；共享 src 和既有聚合测试均未变化，新文案测试另验 63/63。
- 独立候选：`codex/vaiwl-pro-r1-20261031`，从交接 HEAD 分出并继承上述最新基线。PR #16 仍由原负责人维护。
- 改动只在 `src/pro/`、`tests/pro/`。共享适配以未应用 `.patch` 交付，没有改动实际 Free、Host、数据库 schema、构建入口或安装配置。
- 延续当前 **DB4**、既有 ID、原生/人工资产和 Free 活动语义。没有复制 Free 实现，也没有新建生产数据库。
- 原交接的真实 NONE 来源缺口、真实 Mac/宿主验收状态和延期规模目标不因本候选通过而改变。

## 实际运行

需要支持 ES modules、`node:test`、`structuredClone`、Web Crypto 的 Node；本次验证为 Node 24.22.1。纯代码测试没有 npm 项目依赖。

```bash
node tests/pro/run.mjs
node tests/pro/run.mjs --regression
node tests/pro/serve.mjs
```

打开 `http://127.0.0.1:4173/`，可以实际创建主题、收录/关联聊天、改名、设锁/解除、排除、查看并接受本地规则建议、撤销及查看冲突、编辑 Series、预览拆合、切回原生视图、备份和恢复。

页面明确标明合成样本与本地规则，不连接真实账号。两张同名 Project 卡片来自原 Free 组件，保留不同原生 ID。“运行连续旅程”对空白样本执行真实 controller/port/domain/IDB 调用；“新建空白样本”使用另一组独立测试资料，保留已有样本。

浏览器测试使用 `browser-journey.mjs` / `ui-browser.mjs` 显式入口，由 `--browser` 加入；不进入共享纯 Node 的 `*.test.mjs` 自动收集。浏览器测试需要自行提供 Chromium 和 Playwright；不读取或复用用户浏览器资料。使用已有的开发环境依赖即可：

```bash
PRO_CHROMIUM_EXECUTABLE=/path/to/chromium \
CODEX_PRIMARY_RUNTIME_NODE_MODULES=/path/to/node_modules \
node tests/pro/run.mjs --browser --regression
```

可选 `PRO_CJK_FONT=/path/to/NotoSansSC.ttf` 用于完整 demo 的中文截图，`PRO_UI_FONT` 用于集中 UI 测试。`PRO_EVIDENCE_DIR` 指定测试和整体验收截图输出目录；`PRO_UI_SCREENSHOT_DIR` 指定编辑面板截图目录。默认字体来自本机，仓库没有下载字体、浏览器或依赖包。浏览器测试将所有非回环请求拦截，并使用一次性独立 profile。

完整声明校验：

```bash
tsc --noEmit --strict --lib ES2022,DOM --module ESNext --moduleResolution bundler \
  src/pro/contracts/VAIWL_PRO_CONTRACTS.d.ts src/pro/contracts/R1_CODEC.d.ts
```

这验证声明合同可编译；运行时安全由实际 schema、领域不变量及反例测试验证。

## 已实现的主链

同一条 `c_beta` 样本具有显式合成 NONE 证据：

1. 原 Free 视图 → 人工创建主题并收录种子聊天。
2. 本地元数据召回与 `fixture-rules` 建议 → 首轮先预览再确认。
3. 人工派生标题与移动主主题 → 旧主题留下精确硬排除。
4. 整笔撤销移动 → 后续锁定引发旧 inverse 冲突，整次零写入。
5. 明确选择当前版本下的新补偿计划，原操作不伪标为“部分撤销”。
6. 建立 Series、从指定主题进入并返回；部分拆分先提示工作线冲突。
7. 人工修改工作线后拆分；合并包含/排除冲突先阻止，再明确解除并重新预览。
8. Free/Pro 切换保留全部资产；自动与人工 journal 按数据 patch 顺序重建。
9. 重启和真实浏览器进程重开保留数据，处理许可保持关闭；纯数据备份可导入空白目标，授权和待执行任务不恢复。

`tests/pro/support/continuous-journey.mjs` 是这条旅程的可执行定义。Node 和真实浏览器使用同一函数。`ui-browser.mjs` 另用实际鼠标/键盘交互验证编辑、旧草稿、焦点、点击中的更新、撤权、工作线预览、窄屏，以及超过 200 条时的有界分页。

## 模块与复用

| 入口 | 责任 | 已复用机制 |
|---|---|---|
| `domain/` | 严格 schema、纯 reducer、提案/结构/Series、atomic inverse、补偿 | 原 `digest/stable`、既有 Placement ID |
| `evidence/`、`organize/` | metadata 最小证据、中文/英文召回、候选和独立自动门 | 原引用、版本和活动决定 |
| `projection/`、`navigation/` | primary 活跃、原名剩余入口、显式来路和返回 | `aggregateFreeActivity`；原 Free DTO 原样转发 |
| `ui/` | 主题工作区、侧栏、人工操作、建议/记录/拆合面板 | 原 Free CSS、图标、Project renderer |
| `migration/` | 原资产映射、含自动 patch 的有序恢复、数据备份 | 旧 `validateState`、原 ID/别名/顺序/锁 |
| `integration/same-db-store.mjs` | 既有连接中的 overlay/checkpoint/journal 原子写 | ScopeRepository、原生版本 fence、现有 object stores |
| `jobs/`、`model/` | 安装总预算、scope 子额、任务状态、默认关闭的 Responses 协议 | 受控 owner 授权与 transport 注入 |
| `integration/billing-store.mjs` | 同库安装总账、任务、日志一次事务持久化 | 原连接和现有 b23 stores，无 schema 升级 |
| `runtime/controller.mjs` | 六 port 的可信进程内 UI facade | 不向 UI 返回 grant/receipt/provider handle map |

冻结类型保持原样；`contracts/R1_CODEC.d.ts` 单独声明主稿所需的实现 codec 补充：批量确认、`chosenPrimary:null`、完整 inverse 的 readSet、tombstone/提案记录/历史主关系 patch。具体理由在集成合同中列出。主题之间的 `TopicRelation` 按原合同保留为后续可选功能，当前明确拒绝，不混同聊天 related 关系。

## P4 / P5 已继续完成的工作

Responses 适配器有固定 HTTPS 端点、严格 structured output、refusal/truncation/outcome-unknown 分支；没有默认 fetch、密钥或重试。实际执行必须由 owner 的一次性 ticket 和已持久派发标记控制。

安装级预算和 scope 子限额共同生效，精确微单位计算，派发后未知费用不会因重启、切换账号或跨账期清零。持久 adapter 已测试两连接并发、journal 写入失败回滚、配置收紧、明确对账和恢复，仍没有发出网络请求。

评测代码包括独立 lane、Wilson 区间、覆盖分母、自然样本/训练评测泄漏检查和找回时间。合成数据不会计入自然质量成绩。当前没有获批的真实模型、价格卡、付款配置或自然中文评测结果，所有自动质量门仍关闭。

共享接线、codec/备份/GC、最低 reader 和真实扩展打包的具体要求见 [集成合同](integration/CONTRACT.md)。最小 owner 补丁以独立文件交付，由唯一共享负责人接入；本分支不会自行应用或发布。

## 可审证据与限制

最终聚合 **443/443，0 失败、0 跳过**：Pro 209 项（含两个真实 Chromium 测试），相关共享回归 234 项。最新基线恢复文案另验 63/63。未应用共享补丁在临时镜像另验 202/202，包含重叠共享回归，不能与前述数量当作唯一测试总数相加。声明合同严格编译、补丁 apply-check、源码 manifest 和性能源码 hash 核对均通过。35 场景映射为 30 个离线工程验证、3 个部分验证且有外部门、2 个未运行；完整映射保留每项具体证据和缺口。

`tests/pro/evidence/test-results.json` 保存每个实际测试名、通过/失败/跳过数和环境。`source-manifest.json` 保存受测 Pro 源文件的 SHA256，避免将文档 SHA 或未提交源码混作测试依据。`browser-journey.json` 保存同一条聊天的状态旅程、浏览器版本、外部请求数和整进程重开结果。场景与黄金序列映射保留外部关卡，不把离线证据升格为产品验收。

性能报告使用 1000 引用/100 主题和 30 个热样本，保留冷首调用、所有样本、环境、先前未达结果与源码摘要。最终开发测量：人工 reducer p95 73.345 ms（目标≤100）；缓存切换/投影 16.036 ms（目标≤150）；MockIDB 全链 423.229 ms（目标≤500）。全链最大样本 423.959 ms；优化前 546.951 ms 的未达结果与先前观察均保留。优化复用同一序列化与已校验 checkpoint，保留完整 schema、隔离副本和原子事务，并新增 5 项对象别名/回调副作用边界测试。仍需真实浏览器/宿主下测量。10k/100k 保持原延期状态。

**交付状态严格分开：** 独立代码及隔离样本可运行；共享生产接线尚未启用；真实宿主/真实用户/自然模型验收未执行；正式分支未合并，未部署，未发布。没有进行真实付费模型调用、个人数据操作或用户数据外传。
