# 原型与 20/20 记录的证据边界

本轮读取原型完整 HTML/CSS/JS、原测试脚本、VALIDATION、JSON、log 及四张截图，没有重生成或重跑。源文件 hash 见 SOURCE_REGISTER。下表保留原测试名称/结果并解释实际断言，不将其升级为 live 结论。

## 1. 原记录环境

2026-10-10；Python Playwright，系统 Chromium 144.0.7559.96；1440×1000 与 390×844。默认 bundled executable 未安装导致早先启动失败；之后 file:// 受管理员策略阻止，原测试未绕过，改用 `page.set_content` 内存页面。未测试 file://、本地 HTTP 或 LocalStorage 跨刷新持久性。

20 个 case 每项新 browser context。结果 JSON 为 pass=20/fail=0；逐项 script_errors、page requests 为空；log 与 JSON 的结构一致但文件末尾换行不同。这只证明执行路径中未观察到页面请求，不是全进程无网络证明。四张 PNG 分别为工作区、桌面对话、窄屏对话和研究报告；原 VALIDATION 结尾“三个 PNG”指原型截图，包内另有 report-desktop.png，来源登记按实际四张保留。

## 2. 逐项映射

| # | 原用例（原记录均 PASS） | 实际证明范围 | 正式所缺 |
|---|---|---|---|
| 1 | 跨三个原生来源聚合 | 六个硬编码 PAIA 示例具有三个 project 字符串 | 真实身份/Project 观察/跨来源导航 |
| 2 | 分面筛选 | 示例数组筛选数目 | 自动分面质量/长期稳定 |
| 3 | 原生来源与覆盖说明 | modal 展示预写原名及部分覆盖文案 | 来源认证/正文完整性 |
| 4 | 显示改名与人工锁 | aliases/locks 更新且 replayAI 不清锁定别名 | 持久 revision/异步模型竞态 |
| 5 | 原名/别名/已知输入检索 | 当前替换名、原名、硬编码 body 可子串匹配 | 多代历史别名、全量索引/片段/性能 |
| 6 | 归属纠错/负向排除/撤销 | 选择写入 placements/excludes，快照 undo | AI 归属算法遵守排除、并发冲突撤销 |
| 7 | 拖入工作区保留多重归属 | drop 后打开多选框，保存保留两个位置 | 直接拖放产品默认获批/真实范围 |
| 8 | 切换显示保留当前草稿 | draft 保存在 JS 中，render 后重填示例 textarea | 原生 DOM 不重建、IME/焦点/selection 不丢 |
| 9 | 工作现场保存恢复及去重 | snapshot/tabs 数组、Set 去重 | 真实 Chrome tabs/window/失效项恢复 |
| 10 | 原生模拟改名需授权且可取消 | checkbox 前按钮 disabled；取消不写示例覆盖表 | 可信扩展授权/实际目标 |
| 11 | 原生模拟改名回执 | nativeOverrides 赋值，标 VERIFIED_SIMULATION | 真实执行及 post-read |
| 12 | 原生模拟冲突拒绝覆盖 | 原名字串预置变化则 CONFLICT | 最后一刻并发、UNKNOWN、撤权/恢复 |
| 13 | 示例账户展示隔离与返回 | 两份本地 store，页面不显示另一示例 canary | 宿主认证、存储/进程隔离、跨 tab 竞态 |
| 14 | 拒绝跨示例账户导入 | 固定 personal 样本拒绝 other | 实际来源 scope/export 解析 |
| 15 | 导入去重及未知来源 | imported 布尔量，两个固定 extra 数据 | 通用 ZIP/parser/id 去重与事务 |
| 16 | 适配故障回退保留当前对话草稿 | fault 切 mode 后整页 render | extension disable/worker/真实 DOM 回退 |
| 17 | 键盘搜索和关闭 | Alt+K/Escape 的示例 dialog | 全键盘、读屏、真实快捷键冲突 |
| 18 | 动态标题按纯文本渲染 | 特定 img/onerror 字符串转义 | 全输入面 XSS、bridge/权限/导入安全 |
| 19 | 新建目的地与派生归属分离 | select 的示例 destination 状态 | 真实 Project 入口/稳定新 ID/归类 |
| 20 | 390px 窄屏导航与布局 | 无水平溢出、导航与 textarea 可见 | 移动浏览器支持、200%/读屏/物理 IME |

## 3. 从源码读取的差异，不能被原型外观掩盖

- `render()` 重建 `root.innerHTML`，`chatView()` 和 `composer()` 都生成模拟聊天；正式架构明确禁止重建原生聊天岛。原型不能直接移作产品运行时。
- `base/extra/other`、workspace、title、facet、系列均预设；`replayAI` 仅保护 lock/清未锁别名，没有模型，也没有重新归属检查，所以不证明 exclude 已被 AI 尊重。
- `aliases` 是单个当前替换名，不是完整历史别名链。原报告要求历史别名，测试只检查原名/当前别名，不应误报该差距已完成。
- `stores` 同时存在于一份页面 JS，测试接口可返回两份 store；界面不显示 canary 不构成生产安全边界。
- `mutate/undo` 为完整派生快照，最多 30 项；没有正式 operationId/CAS/multiwriter/IDB。正式规格要求冲突感知逆操作。
- `newDialog` 每次弹出且默认普通聊天，未记住工作区目的地；`confirmNew` 只改页面状态，无原生创建/发送。
- `openChat` 每条打开即加入数组，不是经过筛选的工作集；restore 的过滤未知引用可能丢失失败项，与正式“保留失败项”要求不同。
- 原型页面中的 native review 是普通 modal，不能作为正式可信授权 UI；UNKNOWN/批次暂停/真正撤销未实现。
- 浅色与固定尺寸只是研究示意；报告有深色、读屏、200% 等目标，原测试没有这些证明。

这些是原材料的完整性说明，不修改原型，也不借机重新设计 UI。正式实现采用已批准语义及相应真实实验，不复制模拟捷径。
