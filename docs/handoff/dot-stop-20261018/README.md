# dot VAIWL 停止协作交接索引

2026-10-18 22:02 UTC，用户要求收尾并停止 dot 对 VAIWL 的接管与开发。本分支只归档已有成果；不提出新实施任务，不要求 local Codex 接线或停工。现有 PR/分支保留，不合并、不部署、不改 Free/main。

## 核验范围

- 采用状态只读核对至 Free `d3cc5431397f3116832c4878438fec9c12698122`（22:04 UTC 左右）。
- 相关 dot 子任务已无其他运行者；本片没有遗留运行中的测试、浏览器或 Git 操作。此结论不代表本地 Codex 的进程状态。
- 本次没有执行测试、修复、CI、真实账户操作或生产写入。归档分支不匹配现有 workflow 的唯一 Free push 触发条件。
- “PR 未合并”不等于“代码未采用”；以下按实际文件证据区分。

## 已有远端交付，不重复复制

| 交付 | 精确提交 | 停止时状态 |
| --- | --- | --- |
| [PR18：片段浏览器 runner 生命周期](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/18) | `3a753d077b6df88c22a19eb9c9cd033a8e4a81c6` | PR open/unmerged；lifecycle helper 已在 Free，Git blob 完全一致。runner/测试后续有变化，属于已有采用证据，不要求再次合并。 |
| [PR19：peer history 顺序与诊断](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/19) | `a486153fa4198ab8d74e5ccab048920eaff4edb6` | 未采用此交付：新增诊断/证据路径缺失，四个既有 helper/test 的 Free blob 仍与 PR 基线一致。不是生产恢复修复。 |
| [PR20：完整索引分页计算切片](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/20) | `d8cdae66f4da27bdf0b66055b4ef4c79d8eca0fe` | 未直接采用此 helper/未应用 patch，全部新增路径缺失。local 后续已有自己的分页优化，不能据概念相似认定采用本补丁。 |
| [PR21：摄取写入原因复现](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/21) | `2ae53fd4ef3387c33edbaf36be9bd8da8a167380` | 未采用，六个新增路径缺失。只解释首次成员证据与重复重扫，不声称安全提速。 |
| [PR22：续租握手丢失](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/22) | `0afc7210aec03cda1d61209c578969de1b018c75` | 未应用；当前 renewSession 仍将非 verified REFRESH 统一锁存为 scope denial。旧基线 patch 不可直接当作当前已修复。 |
| [view 遗留 busy 局部补丁](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/a5821ef6081e4ca31ab1ccc204eb93cbe652a1d5/tests/runtime/idle-stale-view.md) | `a5821ef6081e4ca31ab1ccc204eb93cbe652a1d5` | 独立分支保存，未应用；当前 begin/current 仍无该 entry+generation 退休分支。真实现场归因未证。 |
| [reading/viewport 几何回归 fixture](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/30cb1202c6b076c747718abd813abdf4a8361e42/tests/host/return-gap-reading-overlap.md) | `30cb1202c6b076c747718abd813abdf4a8361e42` | fixture 未导入；当时 viewport 兼容边界已由 local 后续实现解决。旧 synthetic RED 不代表当前缺陷；浏览器当时 NOT_RUN。 |

PR18–22 均仍 open/unmerged；本次不关闭或修改它们。上述交付的限制、基线和历史验证以各自说明为准，不把历史 PASS 升级为当前完整验收。

## 仅本次补存的历史文本附件

这些文件原来只保存在隔离工作副本，现按原始字节归档；使用 `.txt` 后缀，不接入源码或测试发现。

1. [flat parser 独立 7 项反例](flat-parser-review.test.mjs.txt)：原源码基线 `206af45931e417106c3c236ceb881c43e31d1c09`，历史运行 7/7 PASS。相关窄审结论早已在 [PR16 评论](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6246399424) 交付；脚本本身未作为生产候选审查、未按当前 Free 重基。仅合成数据。
2. [过期摄取 timer 候选说明](superseded-ingestion-pass-expiry.md.txt)、[未应用 patch](superseded-ingestion-pass-expiry.patch.txt)、[12 项复现](superseded-ingestion-pass-expiry.repro.mjs.txt)：**已被替代，不待实施**。源码基线 `3864d39c0b85f8fa5ade02a657046c44e69fc4b9`；候选曾经独审，但发布前 local 在 `8e8a97aac165dfa75dd34f8c8d170d7fc5229781` 用原 current() 在 idle 查询中退休提示，解决同一机制。独立 7 项功能控制也在 local 修法通过。没有发现必须争取 timer 实现的额外风险，故没有发布该旧候选。附带说明中的历史命令/结果不是执行指令或当前验证。

### 原始附件 SHA-256

- `flat-parser-review.test.mjs.txt` (6442 bytes): `db456b635d3d544ec0824c46f7236e8c35a13df1773588702d7dfef7d02fcd3c`
- `superseded-ingestion-pass-expiry.md.txt` (5631 bytes): `70df5ecafd25dc4d894a4ffaaafebfd69a02a35978a71f99b77508a3f4d0d13e`
- `superseded-ingestion-pass-expiry.patch.txt` (9711 bytes): `e3b1feee657076a76336ce9e63dc5cec8ec7c2b28c047e18820ca6f7f51a65f3`
- `superseded-ingestion-pass-expiry.repro.mjs.txt` (7183 bytes): `d4da4a627ba0577dd912906728adc91b7c92fb8b4b16f01a3f11512da64cf492`

## 未提交文件的处理

PR20/21 在隔离副本中显示 untracked，是先前通过 GitHub API 交付所致；本次逐文件核对，内容 blob 与远端提交全部相同。PR22 的本地 patch/repro 也与远端对应文件相同。没有需要救援的未发布生产改动。

其余旧日志、失败输出和不同基线的隔离快照保留原位，不删除、不当作新候选；已有有效交付不重复上传。此索引及四份文本附件完成历史保存，不启动后续监测或开发。
