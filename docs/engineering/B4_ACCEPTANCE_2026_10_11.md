# B4 最终工程闭环 — 隔离合成宿主

2026-10-11，Asia/Shanghai。**B4 本轮剩余工程闭环通过。** 新 stacked Draft PR #8，分支 `codex/vaiwl-b4-lifecycle-20261011`；base 是已验收 PR #7 分支 `feat/vaiwl-b2-b3-persistent-20261011`，起点实时核实为 `dc73231d498d244e8b7bd14dfe95ba981b977537`。PR #7 与 main 不改、不合并。完成后停止，不进入 B5、C1/C2 或真实 ChatGPT 接管。

## 审查与最小实现

原计划 B4 的 CAS、operationId 幂等、IntentLog、冲突撤销、同版本投影以及 IndexedDB 已在 PR #7 实现并有可靠原生证据，继续复用，没有另写数据库/命令引擎。新工作仅在共享客户端、管理编辑器、service 的版本读取和 broker CHECK 响应。

实际剩余缺口：20秒 lease 到期仅清场；worker 冷启动的 stale binding 不重连；跨标签缺版本观察；editor.update 无条件覆盖草稿且使用最新全局 revision 可能绕过旧草稿冲突；未结束的真实回复可卡住重连。前三项原生反例在 baseline-failures.json 保存 FAIL；最后一项在 held-reply-before.json 保存 FAIL。

修复：每2秒读经 broker 后置授权屏障检查的版本元数据，版本变化才取 snapshot；实际20秒 lease 到期和失效 worker 重新 BIND；6秒请求期限、最多5次重连退避、终态非敏感失败反馈及显式重连入口。command/undo 都不自动重发，已提交但丢回包保持结果未确认；迟到响应被 generation/URL/revision 屏障拒绝。

编辑器保留每个脏字段的版本及内容，不因后台刷新覆盖；首次保存仍用草稿的原版本进行既有 CAS，冲突展示最新已保存值并保留草稿，用户核对后再次点击才用核对后的版本提交。短暂失去绑定时自有 editor DOM 脱离页面，重新验证同 scope 后恢复；路由/unknown/账户变化则清除旧 editor。原生输入、正文和消息从未由扩展重建。

## 最终真实账本

| 层级 | 结果 | 原始证据 |
|---|---|---|
| B4 实际 MV3 核心 | **5/5 journey PASS，exit0** | core-final.json/.log |
| B4 实际生命周期 | **1/1 journey PASS，exit0** | lifecycle-final.json/.log，可信原生事件和真实 tab 元数据 |
| 完整相关 Node | **121/121 PASS，exit0，零 skipped** | node-final.tap；118继承 +3 CHECK fence反例 |
| 已有真实页面回归 | **17/17 PASS，exit0** | b23-page-final.json/.log/.png |
| 已有真实 MV3 回归 | **19/19 PASS，exit0** | b23-mv3-final.json/.log/.png |
| DOM 回归 | **49/49 PASS，exit0** | dom-final/；opaque/fake sender/mock IDB，仅回归，不代替上述原生证据 |
| 真实 ChatGPT / PAIA / 多小时浸泡 | NOT_RUN | 不在本轮工程通过声明中 |

不累加中间版本结果。B4 是5+1条实际旅程，不把上述回归算成新 B4 数目。原生 IndexedDB/CAS/幂等/撤销实现没有变更，沿用 PR #7 原生39/39的历史合同证据；本轮同时跑其相关 Node 和真正页面/MV3回归。

macOS27.0/build26A428、Chrome154.0.8037.99、Node26.8.2、Python3.14.7、隔离 Playwright1.63.0。只用 `/private/tmp/vaiwl-b4-mac-mFsVCnkE/repo` 的独立副本、新临时 Chrome Profile、合成 loopback、此项目测试扩展。运行时代码最后改变于 `9c81c6b9fc0a5f0d352f3d603595591723ec3d64`；之后生命周期驱动适配及证据/文档更新。所有最终原生报告的 runtime/build SHA256 与最终源一致；B4 core运行之后仅适配生命周期驱动，5个 core 用例 AST 原样一致，账本明确记录运行时/最终驱动哈希差异。

## 覆盖矩阵

| 要求 | 实际断言与裁决 |
|---|---|
| 真正20秒 lease / 长运行 | 65秒期间至少3个不同成功 BIND lease；到期后无需刷新仍可人工保存；PASS |
| worker 真停止 / 自动冷启动 | 实际 workerVersionUpdated stopped；驱动不主动发 wake probe、不 reload，自动 CHECK 唤醒后 running、新boot、同document；原生节点和数据保留，人工写入成功；PASS |
| 多标签状态安全更新 | 后台版本变化更新派生状态，dirty field保留；旧草稿 CAS 失败，远端人工修改未被覆盖；核对后显式再次点击保存，另一 tab 自动观察；PASS |
| 写结果不明 / 不重放 | 实际 command/undo 已提交后驱动丢回包；UI显示未确认，分别仅发送一次，存储实际结果存在；PASS |
| 未结束读取 / 迟到结果 | 已生成的真实 CHECK 回包被持有超过期限；6秒后自动重新绑定，后来人工修改保留，释放旧回包也不能覆盖；PASS |
| 真实隐藏 / 恢复 | 实际 Chrome 其他 tab激活后 document.hidden；21.5秒后真实激活原 tab，无刷新重绑，编辑草稿/原生输入/正文/消息节点保留；PASS |
| 真冻结 / 恢复 | 实际后台 tab CDP freeze21秒，浏览器发 isTrusted=true的 freeze/resume/visibilitychange；再激活无刷新重绑，草稿保留；PASS |
| SPA A/B/unknown | 实际 native fixture SPA及Chrome webNavigation；B不显示A标题，unknown零敏感派生DOM，回A保留人工数据；PASS |
| 压力样本 / 原生所有权 | 实际宿主120主题/604引用，extension IDB同规模，原生T1长聊天160消息；现有49项含128成员全展开，真实17/19覆盖工具、slider、模型、每个消息节点、原生标题/Project；PASS |
| 版本元数据授权 | CHECK final async scope切换和显式 invalidate 后不回旧 revision；Node3个新反例PASS |

## 驱动失败与原件

默认 Playwright 启用其内部会话的焦点仿真，后台 tab也报告visible。最初 headless与一次约4秒 headed诊断均保留FAIL；切换真实 tab和另一个CDP会话 focus=false仍不能撤销内部会话仿真，原件保留。最终使用公开 `connect_over_cdp(no_defaults=True)`：先启动自有全新 headless Chrome，仅读取它新 Profile 的 DevToolsActivePort，绝不连接已有端口。用真实 Chrome tabs API激活同一测试窗口的另一 tab，无 JS属性覆盖或假 visibility事件。对 active页强制freeze而未恢复真实可见性的驱动失败也保留；最终先真实后台化，再冻结并激活恢复。

最终原件含 Chrome原始日志、实际 tab/window IDs、owned process/port/profile、可信 native事件和存储行。headed实例已关闭，最终驱动全部headless。没有降低隐藏/冻结/原生/CAS断言，没有跳过压力样本。协议及驱动依据：[Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Playwright connect_over_cdp](https://playwright.dev/python/docs/api/class-browsertype#browser-type-connect-over-cdp)；安装包coreBundle.js也直接核实了默认焦点仿真。

## 可复现

```sh
python tests/b4/real-mv3.py --suite core --out /tmp/b4-core-new.json
python tests/b4/real-mv3.py --suite lifecycle --out /tmp/b4-lifecycle-new.json
node --test --test-reporter=tap tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs tests/b4/*.test.mjs
```

Python须是隔离 Playwright1.63环境，Chrome默认路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可用--browser指定已获准可执行文件。默认suite=core，完整验收必须跑core和lifecycle，两者都是新Profile/headless，环境不同但都是实际Chrome MV3。实际执行命令和每项实际值保存在原件argv/JSON中。所有证据目录 `docs/engineering/b4-mac-2026-10-11/`，SOURCE_AND_RUNS.json绑定源码/构建，SHA256SUMS.txt校验原始字节，阶段检查点已分别提交PR #8。

## 裁决与边界

本轮六条原生 B4旅程全部通过，没有未解决的本轮 FAIL。重连只恢复验证后的派生读取与新绑定，从不复活旧 lease、旧操作或未知账户的数据；写入结果不明不会盲重试。已有保守的 scope-wide CAS保持，后台版本观察最长通常约一个2秒tick加真实请求时延；后台/冻结停止读取，回来重新取权，而不是持续保留敏感UI。

不宣称多小时/全天浸泡、浏览器崩溃/配额/损坏备份/跨设备或生产身份与真实ChatGPT全链已验证。恢复仍是PR #7的显式有损恢复，属于后续B5范围，本轮未做。B4在隔离合成宿主范围内完成；保持新PR #8 Draft，不合并，不改PR #7/main，不自动开始后续阶段。
