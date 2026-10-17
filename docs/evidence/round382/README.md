# Round382 — 实际 MV3 双列表分页

未修改生产源码。新增 opt-in `tests/host/frame-pagination-package-browser.mjs`，复用现有应用拥有的原生 fixture、生产打包、隔离 headless Chrome、新 profile、外网拒绝代理和清理流程。仅 localhost 账户和原生页面；无 IDB/授权 seed，无手工 frame offset 请求，无生产包插桩。

## 最终实际结果

`FREE_PAGINATION_RUN=1 node tests/host/frame-pagination-package-browser.mjs /private/tmp/round382-pagination-mixed.json`

**PASS_OFFLINE_MV3_PAGINATION_SUBCHAIN**，exit 0：

- 原生首 Project 展示 80 个成员，原历史 1000 条。正常 Host 观察后真实 Free DOM 的 Project 分区遍历 80，UNKNOWN 分区遍历 920；互斥，合法 ID 完整并集恰为 1000。
- 实际更多按钮 Project 19 次、UNKNOWN 187 次，均从 5→17→29→41 扩展，自动缩至每页 5 条后继续到末页。每次点击等待真实有序 ID / 按钮状态变化，六秒单步、九十秒每列表及 240 次点击硬界限。
- 两类真实“上一页”均返回此前实际渲染过的完整 ID 页。
- 每个实际渲染链接独立核验原始中文/英文标题、合法 ID 及原生目标 URL；原 document/editor/草稿/Project URL 保持。
- source、fixture、build manifest 前后 hash 均不变，临时目录已删除，浏览器和网络 guard 正常关闭。
- 独立审查通过；原 L 三项回归 **3/3 PASS**。生产源码未变化，不重复全套；最近完整回归仍为 Round381 的 **7205 PASS**。

## 保留失败与校正

1. 初版要求每次点击增加去重数，在先展开 53 条后缩到 5 条并重新经过已见前缀时错误 FAIL。保留原报告/日志/精确 runner。改为等待真实分页状态变化及最终精确并集，无固定 sleep。
2. 单 Project 场景真实遍历全部 1000，但 UNKNOWN=0，因此正确 FAIL 双分区前置条件。保留该报告及对应 runner；最终改用已有 project-mixed 场景建立双分区，未改变产品或放宽前置条件。

## 验收范围

这是 **LEGACY_LOOPBACK_RECONSTRUCTION 的 S 分页子链**，不是完整 Host/81 项或 Free 验收。当前逐 ID oracle 验证合法集合/原名/URL和互斥并集，没有另外断言完整 Project 成员分配公式，不能据此声称 membership 全认证。原生输入检查限原节点、草稿及 URL 保持，不等于所有模型/工具/IME兼容。

100k 原 FAIL、性能、自动休眠、即时首发、实际 PAIA、真实账户/跨端及其他 G/U 条件继续开放，**NOT_RELEASE_READY**。
