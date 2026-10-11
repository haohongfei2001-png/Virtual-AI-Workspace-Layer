# C1：主题工作区与 v2.7 导航工程验收

本轮在 PR #8 已验收基础上完成 C1 剩余界面工程；新 stacked Draft PR [#9](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/9)，base `codex/vaiwl-b4-lifecycle-20261011`，核实起点 `3b1a40f9d2bedfd3180a32c3db6d12d5a28e9fd9`。最终运行时代码提交 `20a64343f7132eb6a980279fb7900710c8eceba8`。后续仅证据和报告。PR #7/#8/main 不修改、不合并；完成后停止，不进入 B5/C2、AI 分类或真实 ChatGPT 接管。

## 已实现、缺口与证据层级

审查了 STATUS、AUTHORITY、INTERACTION_SPEC、CORE_FLOW_V2_7、DEVELOPMENT_PLAN、原生保留矩阵、src/navigation 和实际 MV3 client/editor/adapter。30当地日历日、唯一最近活跃段、静态主页主题、左侧旧项、独立原生搜索、一个阅读返回以及 B1–B4 已实现，直接复用。`src/data/`、`src/b1/`、worker、projection、host.css 均未修改；host仅新增明确size=120合成样本启动参数；没有第二套导航或数据库。

实际缺口是主题局部菜单/查找、产品化人工编辑、当前项越过预览容量后的定位、重绘焦点、长旧列表容量以及长卡对其他列的影响。改动只落在共享 navigation/其自有CSS、既有editor/其自有CSS和client的管理入口上下文/关闭焦点；另外修复合成adapter的远引用链接测试模式/样本参数保留。单色图标、轻边界、主题头与缩进从属线建立层级；选中窗口保持中性底面。各列独立延续，展开长卡只增长其所在列；DOM与键盘顺序仍来自仓库人工顺序。

这不是离线HTML替身：截图来自真正已加载的 Chrome MV3、真实 service worker、扩展 IndexedDB，运行的就是共享 src/navigation。宿主、账户 witness、发送时间和原生控件仍是明确的合成 fixture；生产 ChatGPT adapter/resolver/权限/第三方共存没有接入或验收。历史 v2.7 原型及过去云端模拟数字不是本轮真实证明。

## 最终结果

| 层级 | 实际结果 | 选择的最终证据 |
|---|---|---|
| C1 原生 MV3 界面 | **9/9 PASS**，exit0，无页面错误 | ui-complete/results.json；单独运行 |
| 完整 Node | **121/121 PASS**，零 skipped | node-complete.log |
| 完整 DOM | **49/49 PASS** | dom-complete/results.json；原有 fake sender/mock IDB，仅回归 |
| 真实页面/IDB | **17/17 PASS** | b23-page-complete.json |
| 真实 MV3/IDB | **19/19 PASS** | b23-mv3-complete.json |
| B4 核心重连/并发 | **5/5 PASS** | b4-core-complete.json |
| B4 实际生命周期 | **1/1 PASS** | b4-lifecycle-complete.json；可信隐藏/freeze/resume事件 |

结果不累加中间通过数。B2/B3 真实数据库合同沿用 PR #7 的历史证据，没有重建或重新宣称那些合同为 C1 新测试。最后UI执行时git HEAD仍为092a44a、工作树已含当前项定位改动；SOURCE_AND_RUNS明确记录此事实，实际源码/构建SHA256与随后提交的20a6434完全一致。全部最终源码/构建哈希绑定 SOURCE_AND_RUNS.json；SHA256SUMS.txt校验原件。最终实际命令由 COMPLETE_COMMANDS.json 和 FINAL_COMMANDS.json/C1 argv 保存；中间批量 DELIVERY_COMMANDS.json 仍保留真实 exit1。

macOS27.0/build26A428，Chrome154.0.8037.99，Node26.8.2，Python3.14.7，隔离 Playwright1.63.0。本轮全程headless，只启动全新测试Profile和127.0.0.1合成服务器。C1驱动开启Chromium sandbox；继承回归沿用已有测试驱动。生命周期驱动只连接自己刚启动的Chrome新端口。未读取日常Profile、私人聊天、PAIA或真实账户，未改变系统/管理员策略、付费计划、CI或部署。

## 功能覆盖矩阵

| C1 条件 | 实现/断言与裁决 |
|---|---|
| 正式主题卡片/工作区 | 共享导航拥有卡片、清晰主题头/稳定DB图标/低对比从属线；各列独立延续，保持DOM与人工顺序。实际桌面截图＋长卡不推动其他列的几何断言；PASS |
| 固定30当地日历日 | 复用原投影；Node包含月末、闰年、DST连续边界；真实UI依次0→1空段→2，不跳段、不重复W0；当前无向上占位；PASS |
| 主页不可整卡折叠 | 静态h2，菜单在标题外；近期成员直接显示，近期6行/12增量沿用基线；W0全部126近期可达；PASS |
| 旧窗口父主题内局部展开 | 左侧34px命中区，右/下箭头，独立aria-controls与焦点；默认12旧项/12增量。通过16次实际人工UI PLACE保留真实旧证据，最终17旧项全部出现；未知T3不混入；PASS |
| 未知记录 | 全记录与主题局部查找可达；不伪装旧项，不另造日常未知按钮；unknown账户无敏感派生根；PASS |
| 名称/图标/顺序/标题/人工修改 | 原B3命令及B4每字段草稿版本，原CAS/幂等/撤销；主题菜单编辑预选准确目标。◆、人工名、order=-1与人工派生标题保存并刷新持久；多标签冲突/显式核对后再保存继承回归；PASS |
| 搜索 | 大小写/空格规范化、主题范围、诚实已知范围、空结果、24行增量。DOM逐批展开仍严格核对604与最后T11903；新增实际normal/Meta新标签打开最远窗口、原生输入与单一返回断言，独立原生搜索/快捷键不替换；PASS |
| 侧栏/当前/阅读返回 | 侧栏仍可折叠，手动展开保留；L127超过近期容量仍直接定位；最远T11903的当前行几何上完全进入自有侧栏视口，保留手动滚动，不动原生正文或焦点。现有单一返回恢复来路/滚动/展开及原生草稿选区，不改浏览器Back。原生固定/Project/模型/工具/权限保留；PASS |
| 宽度/深浅色/空状态/长列表 | 1440桌面、430窄屏与原生抽屉、深色、空段、长近期及长旧项均实际截图；没有新建ChatGPT头栏、日期/来源/计数；PASS |
| 键盘/焦点/动画 | Enter双向旧项开合保持焦点；菜单方向键/Escape回准确入口；保存前清理旧成功提示；源码实现重绘时查找输入选区保持，静态卡头无折叠。自有短transition遵循reduced-motion，原生动效不改；PASS，物理IME/真人初见理解NOT_RUN |
| 继承B4安全 | 真20秒lease自动续权、实际worker stopped→自动running新boot无刷新；持有真实回复超时、迟到拒绝、command/undo回包丢失不盲重发、隐藏冻结/SPA A/B/unknown；PASS |
| 压力样本 | actual host与extension IDB均120主题/604引用；W0原128成员中126近期/1旧/1未知不缩；原生T1长聊160消息继承真实回归；PASS |

## 原始失败、修复与限制

稳定原始反例在 baseline-corrected/：未改PR #8运行时，三项真实FAIL（主页旧项丢焦点、L127缺失、局部主题菜单缺失），C1最终对应全部PASS。IMPLEMENTATION.patch绑定最终最小UI修复。源驱动定位、持久化区间起点、未支持的theme控制、额外BIND抢占以及列位置假定等问题单独解释在 FINAL_FAILURES.md 和阶段检查点，没有归因给产品或删除原件。DOM D28按真正新增的分页展开，仍要求全部604而非减少样本。

曾在多个Chrome同时运行的 ui-delivery/ 中观察到一次长旧列表准备写入未确认，原始 **FAIL保留**，截图显示“保存结果未确认”，没有成功提示或自动重放。原样单独运行8/8通过；之后实际视觉长列修复的最终独立UI新增远引用后9/9通过，全部最终相关回归再次通过。不能据此宣称高并行负载所有人工写入一定成功确认，或把未确认回包等同于已证明数据丢失；遇到此状态仍按已验收B4核对持久数据，不盲重试。

额外稳定反例：dom-product/ D16返回滚动被列布局临时测量清零，修复后原断言PASS；far-route-before/中T11903真实新标签缺少MV3测试模式/完整合成样本，修复合成adapter/host参数后正常点击及Meta新标签均保持实际会话、输入与工作区返回。这不修改持久URL或接入生产宿主。

current-position-before/保留了当前行虽存在却在滚动视口外的真实几何FAIL；最后只调整自有侧栏的路由定位及范围内临时滚动记忆，ui-complete同断言PASS。

最终工程裁决：**C1 在本轮授权的隔离合成宿主范围完成，真实界面可供用户审核。** 没有未解决的稳定C1断言失败；保留上述未确认写入观察及界线，不把它抹成全绿历史。真人视觉认可、物理IME、多小时浸泡、真实ChatGPT身份/时间源/原生插槽与PAIA共存仍不是本轮通过声明。用户审核界面后是否进入其他阶段需新授权。

[实际截图画廊](C1_INTERFACE_GALLERY_2026_10_11.md) · [全部原始证据](c1-mac-2026-10-11/) · [可复现驱动](../../tests/c1/README.md)
