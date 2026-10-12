# Free持续实施检查点（2026-10-13）

此文件仅记录同一 DEVELOPMENT_PLAN 的恢复入口，不另立计划。用户已恢复并明确授权持续并行Free开发。

- 唯一目录：`/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer`；不迁移、不建worktree。
- 分支：`codex/vaiwl-free-first-20261013`，本轮从 `81ff0ec37021eaabc5f7a8aecf61e9076619bf44` 继续，实现检查点 `627696e`、`b2a262b` 已推送PR #16；实际新HEAD以 `git rev-parse HEAD` 为准。
- 已核对远端 Draft PR #16，基于计划PR #15；允许正常commit/push，不force、不改父PR/main、不merge/deploy。
- 私人ChatGPT、PAIA本体、真实原生写入、付费均无授权；只能阻塞相应真实验收，不停独立本地工程。

## 当前增量

同库原生不可变分片/版本分页/增量事务/GC/损坏恢复；Free导航/原名/Project、NONE、UNKNOWN/原生新聊天；活动分层和持久仓库/校准器/固定与自适应时间算法；scope ViewSession冻结；原有Pro数据与入口保留。详情与每组真实性边界见STATUS和新增JSON报告。

## 本次验证

```sh
node --test tests/b1/broker.test.mjs tests/b23/*.test.mjs tests/b4/*.test.mjs tests/f1/*.test.mjs tests/hf/*.test.mjs tests/free/*.test.mjs
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vaiwl-free-playwright node tests/free/ui-browser.mjs
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vaiwl-free-playwright node tests/free/mv3-browser.mjs /private/tmp/free-mv3.json
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vaiwl-free-playwright node tests/free/partition-browser.mjs /private/tmp/free-partition-scale.json
```

第二轮完整Node253通过/0失败，排序优化另有25条针对性通过（不相加）；真Chrome/IDB规模6组、MV3旅程7条、独立活动仓库5条与恢复1条分别有证据，不能累加成FR真实通过数。headless只使用隔离profile/loopback；首次MachPort沙箱失败后受控提权运行成功，没有可见浏览器。当前Playwright依赖在既有 `tests/b1/tooling`，未改变项目管理方式。

## 下一可执行内容

第三轮已实现活动证据100k分片+索引/旧v1迁移、手动native/evidence修复、broker/service后台校准registry接线、可信原生旧名/成员count证明。勿重写这些已测模块。当前所有写入仍synthetic，worker默认无生产source。独立验证发现并修复了库存误认证成员、成员证明cache未失效、无新页面消息时切账户的后台迟到写三类问题，保留对应反例。

最终完整Node297通过。F1真UI/4x六组与侧栏优化后100k两组已执行，10k满足计划数值，100k仍保留首屏与longtask限制；F3可复现ZIP/静态依赖闭合/校验与安装回退材料完成，包只属合成测试。各组source hashes和真实性边界见STATUS，结果不相加。后续最小外部条件：获准独立真实ChatGPT测试账户及可验证本人发送/完整库存来源；获准PAIA干净构建；物理IME/目标弱设备与真人日常验收。不能通过改hostnames或复用synthetic权威替代这些条件。

合成服务仍是synthetic限定；没有生产ChatGPT身份/库存/本人活动源适配证据，不能改hostnames就认证生产。R0/C6实际授权账户、跨设备真值、PAIA干净构建与共存、物理IME/真人日常旅程均BLOCKED_LIVE或NOT_RUN。可安装合成测试包不是完整可用ChatGPT产品；FREE_ACCEPTED/RELEASE_READY/PUBLISHED未达到。

最终本地测试包：`/private/tmp/vaiwl-free-delivery-20261013/vaiwl-free-synthetic-only.zip`；同目录extension可在隔离profile加载。SHA-256 `2592ead6ebb3e8eee576e8752062ea462b0f16e9c6230dc5a9fed8e3d3d33728`。包含此第三轮记录的commit为本次恢复点，实际HEAD用git核对。未发布、未合并、未赋予私人账户许可。

## 最后同步检查点

本地实现提交：`7ac2e28`（第三轮源代码、测试、证据和包生成器）。工作区源码已冻结并通过所列验证；最终合成包49个源码文件哈希与该实现一致。

2026-10-13 GitHub API核对PR #16仍Draft，远端头为 `b2a262b6b60c421b8ed3735f6cae524030097b5d`。正常HTTPS Git查询出现HTTP/2 framing错误；仅该次命令临时切HTTP/1.1推送又在75秒后报443连接失败。未改remote/config，未强推。**7ac2e28及包含本节的检查点提交仅在本地，尚未推送**；网络恢复后直接正常推送当前分支到原origin，不重做代码或验证。

没有以同步失败冒称线上交付。真实ChatGPT来源/完整库存/本人活动、跨端、PAIA干净构建/共存、物理弱设备/IME和真人日常验收仍需要前述最小条件；Free产品并未完整验收。

## 第四轮恢复增量（接25e2ab2）

已补后台校准通知、账户/文档/lease校验与循环抑制，完整Node301/0、实际MV3 9/9；另外Chrome生命周期5/5、共享资产与通知阅读8/8、校准200.1ms且来源1次。结果与各自源码来源见STATUS第四轮。新合成包路径 `/private/tmp/vaiwl-free-delivery-round4-20261013/vaiwl-free-synthetic-only.zip`，SHA256 a63b1aa6928dc6d047a7450ca18adf2483839ae47360e3c1b6176e75ae605fb3。

仍有可本地推进的F1问题：配置source后每次提交FreeRuntime.read仍全量snapshot+evidence投影；需要增量发布/过期调度来避免100k更新全库读取，同时保持既有runtime独立调用合同。不要重写已通过模块，也不要把此项标外部权限阻塞。真实账户及其他BLOCKED_LIVE条件保持不变。Git端点短检查仍超时，本轮不重复推送；远端b2a262b，当前HEAD以git核对。
