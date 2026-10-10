# 高仿真宿主覆盖矩阵

> **证据增量：** 下表原本只反映云端Chromium144 opaque DOM和blocked MV3。现已在隔离Mac Chrome154真实执行[Mac MV3追补](hf-results/mac-mv3-2026-10-11/REPORT.md)：正常URL页面4/4、真实MV3 8/8、Node39/39。真实Chrome验证包括SPA A→B→A不串线、Unknown拒绝、无安全边界安全退让、worker停止重启和扩展IDB保留。表内云端BLOCKED措辞仍按其原环境成立，不能作为本轮全局最新结论。真实ChatGPT仍未执行。

所有 `Dxx` 为 Chromium 144 opaque DOM 执行，不是 MV3 或真实 ChatGPT。测试实例的预期、实际和源码 hash 见 `hf-results/browser-final.json`。界面保真不能从此表推算百分比。

| 功能/风险 | 已执行证据 | 裁决及限制 |
|---|---|---|
| 原生基线、发送、停止 | D01/D12/D37 | 合成本地行为 GO；没有模型请求 |
| 原生节点身份、焦点、选区、草稿、交互值 | D02/D03 | GO；物理 IME 未测 |
| v2.7 静态主题卡/当前无↑/左侧旧窗口/近期溢出 | D04/D05/D06/D38 | GO；单主题 128 窗口，未知不冒充旧项 |
| 派生/原生两种查找、归档与未知可达 | D07/D28/D36 | GO；原生搜索不由派生目录代替 |
| 主题侧栏手动开合/重复渲染/原生局部重建 | D08/D21/D29 | GO；仍保留原生列表，不是生产侧栏替换 |
| 模型/工具菜单 | D09 | 入口、操作、本地结果、原状态、菜单返回 GO；无真实权限/额度 |
| 权限确认/原生 top-layer 优先 | D10/D24 | GO；原生弹层出现时增强让位，不替用户确认 |
| 附件/文件预览 | D11/D33 | 合成 bytes、真实 file input 与 preview GO；无上传/扫描/真实文档权限 |
| 流式中切换主题/历史 | D12 | 原生本地 timer 和节点保留 GO；非真实网络流 |
| 编辑、重新生成、分支 | D13/D35 | 合成宿主可操作；不宣称真实 B2 新发送捕获 |
| 分享 | D14 | 仅本机合成结果；无公网分享/链接权限 |
| 跨 Project 窗口/原生项目文件与指令 | D15/D33 | 派生引用与原生上下文分离；逻辑路由 GO，实际浏览器/真实 Project BLOCKED |
| 单一返回/历史段/滚动/展开恢复 | D03/D04/D16 | GO；已修复隐藏容器滚动恢复问题 |
| A/B/A、unknown、迟到回包 | D17/D18/D32 + B1 race 2项 | 合成隔离 GO；真实身份与 Chrome sender BLOCKED |
| 快速路由/失败/乱序 | D19/D20 | 宿主逻辑控制器 GO；actual browser Back/Forward BLOCKED |
| 无安全边界、无便利插槽、动态头部占位 | D22/D23 | native-first 退让 GO；对应增强 NATIVE_ONLY/LIMITED |
| 新增未知入口/待批准状态 | D24 | GO；没有静态白名单隐藏未知原生入口 |
| 长输入、390px窄屏、深色、减少动态 | D25/D26/D27 | 实际几何/样式/控件 GO；非当前 ChatGPT 像素验收 |
| 大量主题/长列表 | D28/D38 | 120主题/604引用/128窗口 GO；不等于 F1 的 10k/100k 性能目标 |
| 宿主主动重建 vs 扩展误重建 | D29 | GO；非 React 私有生命周期复制 |
| 受控退出/局部样式同时变化 | D30 | 自有节点/属性清理 GO；真实 disable 未验证 |
| 传输失败与明确重连 | D31 | 故障注入 GO；不是实际 worker 死亡 |
| 当地日历日、DST、闰日、时区、坏时间 | A时间测试 + D34 | 逻辑 GO；真实发送时间来源 BLOCKED |
| 页面/扩展 origin IDB、实际 CAS | real-browser gate | 当前环境 BLOCKED；原 B1 仓库未替换成内存实现 |
| MV3 load、worker stop/restart | real-browser gate | 当前环境 BLOCKED；驱动源码已提供，无通过声明 |
| extension disable/re-enable/reload/freeze | 未实际触发 | BLOCKED；计时器或“点击退出”不能替代 |
| 物理 IME、语音、读屏、200% | 未执行 | BLOCKED；语音按钮明确提示未接入 |
| PAIA 本体共存 | 不在本轮授权修改/连接范围 | NOT_RUN；无 PAIA 本体兼容声明 |
| C 真实 ChatGPT 登录态五格 | 本轮禁止登录 | 全部 NOT_RUN / BLOCKED |

本表的 GO 只对应“已执行证据”一列所标明的受限环境。合成权限、账户标记和新发送事件的标签均不是生产授权。
