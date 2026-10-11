# B2/B3 最终 Mac 隔离 Chrome 增量工程验收

2026-10-11（Asia/Shanghai）。唯一 PR #7，开发分支 `feat/vaiwl-b2-b3-persistent-20261011`，base 仍为 `feat/vaiwl-hf-host-simulator-20261011` / `a02d65388f0a5d09833ac8a7091a45dea1720f82`。初始实时 GitHub head 确认为 `cd9066b16cd76618b639779c7096cb514f015dd8`；完整初始提交和文件清单保存于 `b23-mac-2026-10-11/pr-initial.json`。

**裁决：B2/B3 可从 LIMITED 升级为“隔离合成宿主范围内工程验收通过”。真实 Chrome 的原生 IDB、正常 URL 页面持久化和 MV3 冷启动阻塞均已解除。生产 ChatGPT 接管不在本裁决内。** PR 保持 Draft，不合并，不实施 B4/C1/C2。

## 本机环境与隔离

macOS 27.0 / build 26A428，Node v26.8.2，Python 3.14.7，隔离 venv 的 Playwright 1.63.0，Google Chrome 154.0.8037.99，路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。执行目录 `/private/tmp/vaiwl-pr7-mac-hTNRJ6Mq/checkout`，同仓库独立 Git 对象副本，checked-out SHA 与 GitHub 一致；GitHub 同 SHA 源码归档另有 SHA256。原始 main checkout 未修改。

先审阅 real-browser.py、测试服务及构建：每次新临时 Profile、新构建目录、自有 127.0.0.1 合成服务器，测试结束关闭浏览器、终止服务器并清理临时 Profile。全部 headless，无外部可见浏览器，无已有调试端口，无日常 Profile/Cookie/会话/历史，无真实 ChatGPT/私人聊天、PAIA 或其他扩展访问。仅从此仓库和已授权开发工具读源。没有系统或浏览器管理员策略修改、付费服务、GitHub Actions、production deployment 或其他仓库变更。

首次执行沙箱内 Chrome SIGABRT，完整原件保存为 db-initial.json；本机已授权隔离执行成功，故该失败是执行环境问题，不是 IDB 产品失败。Git HTTPS 遇 HTTP2 错误和连接超时；改用 GitHub Git Data API 上传相同本地 Git 对象，每次前后校验远端 parent、精确校验 blob/tree/commit SHA，`force=false` 更新唯一 PR 分支；未创建平行 PR。该分支不存在 Actions workflow。

## 最终实际结果

| 层级 | 结果 | 原件 |
|---|---|---|
| 原生 Chrome IndexedDB | **39/39 PASS，exit 0**：原 29 合同 + 2 迁移 + 8 原生补充 | `db-final-confirmed.json` / `.log` |
| 正常 URL 页面 | **17/17 PASS，exit 0** | `page-final.json` / `.log` / `.png` |
| 真正 MV3 增量 | **19/19 PASS，exit 0** | `mv3-final.json` / `.log` / `.png` |
| 相关 Node 回归 | **38/38 PASS，exit 0，无 skipped** | `related-final.tap` |
| 真实登录 ChatGPT | NOT_RUN | 未获本轮授权，亦无生产 resolver |

原件均在 `docs/engineering/b23-mac-2026-10-11/`。cloud 118/118、DOM 49/49 仍是上一轮历史证据，本轮未重做全面云端审计、不把通过数累加。页面层使用标明 PAGE_HARNESS_NOT_MV3 的真实宿主 origin IDB 与合成 page transport；只有 MV3 层证明真实 extension sender、worker 和 extension origin IDB。没有 mock-IDB 代替原生检查。

最终 3 份原生结果中的所有 source SHA256 已逐项与最终源码核对一致，所有 runtime buildHashes 完全相同。实际产品修复 commit `36a5934d76c03ad2ddbe27eb0a0cc07e052a4803`；最终驱动 commit `4b695017d27f58e1888ca78a406d382082969a00`；MV3 阶段证据 commit `80feb3622ad8ec7828a856fd90d909a6d7f117cd`。测试运行时 HEAD 与文件哈希各自记录，页面/MV3 运行时驱动尚未提交，其字节与之后最终驱动提交一致；后续只提交证据和文档。`SOURCE_AND_RUNS.json` 是绑定账本，`SHA256SUMS.txt` 校验所有本目录原始证据。

## 功能覆盖矩阵

| 验收项 | 实际证据与裁决 |
|---|---|
| 同 B1 DB、v1→v2 保留旧 Ref | DB01、两项 native migration PASS；错误 schema 升级回滚，DB 仍 v1，无增量残留 stores |
| 创建/改名/图标/人工标题 | 页面和 MV3 真实 UI 写入，再独立读取 IDB 行及管理字段；PASS |
| 加入/移动/撤销 | 真实 UI 操作，前后 Placement 行检查，定向撤销恢复人工归属；PASS |
| 刷新、新标签持久化 | 页面和 MV3 都检查稳定 workspace ID、名称、◆、人工锁、标题、归属和原生 Ref；PASS |
| 两连接/两标签 CAS | DB07、页面原生两连接、页面与 MV3 同 revision 两 tab 定时同时写；恰一成功、一冲突，revision 只增加 1，冲突 UI 不报告保存；PASS |
| 幂等/后续编辑/撤销冲突 | DB05/06/08/12 与原生新补充；PASS |
| A/B/A 与 unknown | A 的人工主题/标题不出现在 B，B 保持 120/604；unknown 无敏感派生 DOM，真实 content BIND denied；PASS |
| 旧异步响应、人工优先 | 持有实际原生 snapshot 后排队新人工写入，最终保留人工结果；实际 worker snapshot 被延迟后切 unknown，不渲染旧数据；PASS |
| 撤权与写失败 | 真事务 queued put 后撤权回滚；真实 transaction.abort 不报告成功；提交后撤权返回 stale-after-commit/committed 而非成功；PASS |
| 证据撤销与重算 | DB13/25/26、native recovery：来源撤销、重新投影，人工数据保留；PASS |
| 状态损坏与视图损坏独立 | DB19/20/23 拒绝损坏状态；两项原生 view checksum/schema 检查及页面/MV3 view 诊断、继续编辑、草稿/原生节点/损坏字节保留；PASS |
| 恢复不复活证据/旧 receipt | 实际原生失败反例修复后 PASS；所有旧 scoped journal receipts invalidated，replay denied，证据 inactive，revision 超过可信 high-water |
| MV3 真加载/通信/数据库 | Extensions.loadUnpacked 返回扩展 ID；真实 content 执行上下文、chrome.runtime 消息和真实 worker origin IDB 独立读行；PASS |
| worker 真停止/冷启动 | 原始 workerVersionUpdated 含 running→stopping→stopped；stopped 后真实 content 消息在 reload 前唤醒，同 documentId、不同 boot；PASS |
| 冷启动重新绑定及人工持久化 | 旧 lease 无 snapshot 被拒，新的真实 BIND 返回不同 lease；IDB 人工状态未变；显式 reload 后 UI rebind 也保持；PASS |
| 原生节点/状态保护 | 输入/表单/正文/每个消息节点/reading/header identity，draft、range=73、tool/model、消息文本和原生标题/Project catalogue 均不被派生编辑改变；PASS |
| 规模未缩水 | IDB 为 120 bootstrap 主题 / 604 refs；增加 1 人工主题后为 121 / 604，B 仍 120 / 604；DB24 覆盖 128 成员；PASS |

## 实际缺陷与最小修复

1. **恢复后旧操作收据仍可重放成功。** 原生索引 cursor.key 是 scope 索引值，恢复代码误当 operation row 主键，旧 receipts 没被正确失效。db-supplemental-initial/diagnostic 中保留稳定 FAIL，实际返回 `ok:true,replayed:true`。最小修复为 `cursor.primaryKey`；同一原生反例重跑 PASS，所有旧 scoped receipts invalidated、replay 拒绝。`db-fix.patch` 保存源码差异。
2. **撤权回滚原因被后续 TransactionInactive 异常覆盖。** 原生 put 后 signal abort，返回失败但理由丢失。保留首次 abort 原因，现在同一断言返回 stale-binding 且 state revision 保持 1。不是把已提交写入误判回滚；postcommit 场景另有真实检查。
3. **测试替身索引游标语义错误。** MockIDB 原先 cursor.key 为 primary key，未提供 primaryKey，掩盖上述实际缺陷。现区分 index key / primaryKey；中间回归不兼容失败也保留，最终相关 38/38 PASS。它不算原生持久化证据。

新增 Python 驱动问题单独归档：严格 CSP 拒绝字符串轮询；status 与原生 output 歧义；尝试替换 frozen broker 未生效；evaluate 返回函数被 Playwright 自动调用。修正为函数轮询、管理对话框精确定位、只延迟实际 repository/worker 结果、显式无返回函数。不改 CSP、不放松断言、不跳过失败、不缩小样本。

没有本轮仍未解决的失败验收项。恢复仍是显式有损恢复；新鲜证据必须重新取得。真实 worker 冷启动后的自动 UI 重新连接、跨标签自动更新通知、长时空闲/冻结/崩溃/配额故障的全部交错，均不在本次 PASS 声明中；本轮证明实际 cold boot + 重新 BIND + 显式刷新恢复。这些已有边界已保留，不开展后续强化。

## 可复现命令

```sh
python3 -m venv /tmp/vaiwl-acceptance-venv-new
/tmp/vaiwl-acceptance-venv-new/bin/pip install playwright==1.63.0
DEBUG=pw:browser /tmp/vaiwl-acceptance-venv-new/bin/python tests/b23/real-browser.py --mode db --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-db-new.json
DEBUG=pw:browser /tmp/vaiwl-acceptance-venv-new/bin/python tests/b23/real-browser.py --mode page --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-page-new.json
DEBUG=pw:browser /tmp/vaiwl-acceptance-venv-new/bin/python tests/b23/real-browser.py --mode mv3 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --out /tmp/vaiwl-mv3-new.json
node --test --test-reporter=tap tests/b23/repository.test.mjs tests/b23/audit-regressions.test.mjs tests/b23/view-isolation.test.mjs
```

原始实际命令见 `COMMANDS.txt`，各原生结果另有 argv、隔离目录、版本、时间和实际 raw records。浏览器日志仅来自测试进程。JSON 原件包含每一项的 PASS/FAIL 与实际值，历史失败没有覆盖丢弃；下面附完整逐项账本。

## 八项最终答复与停止

1. 真实 IndexedDB 通过，39/39；迁移、回滚、CAS、幂等、撤销、损坏隔离和安全恢复已实测。
2. 主题名称/图标、人工派生标题与归属在刷新/新标签后持久：页面和 MV3 均通过。
3. 真 MV3 worker 实际停止事件、同页消息冷启动 boot 改变、数据恢复和真实重新 BIND 通过；不是拿 stopWorker 返回值或 reload 当重启证据。
4. 多 tab CAS 和 A/B/unknown 隔离在已列实际场景内可靠；没有宣称跨系统原子事务或覆盖所有时序。
5. 两项实际产品问题及 mock cursor 语义已最小修复，无未解决 FAIL；驱动故障完整保留并修正。
6. B2/B3 从 LIMITED 升级为隔离合成宿主范围内工程验收通过。
7. 进入既定 B4/C1/合成 C2 不再有本轮 Chrome 环境/持久化验收阻塞。上述自动重连、通知与恢复边界留给各阶段规划；本轮未实施下一阶段。生产 C2 仍未放行。
8. 真实 ChatGPT 接管须独立授权的清洁测试账户/Profile、真实可靠身份 resolver、真实原始发送/历史/分支/导出/coverage 语义、Project 权限校验、原生宿主功能与生命周期回归、账号撤权链验证。合成 A/B URL 标签不能充当生产认证。本轮没有访问真实 ChatGPT。

阶段成果已分别提交现有 PR #7，最终报告与校验账本也提交同分支；实时 latest head 以 PR 为准。保持 Draft、不合并，不修改 main/PR #1/#4/#5/#6，任务完成后停止。

### 原生 IndexedDB 39项

| 项目 | 结果 |
|---|---|
| DB01-same-B1-database-and-canonical-refs | PASS |
| DB02-create-update-stable-id-and-reopen | PASS |
| DB03-derived-title-alias-and-native-immutable | PASS |
| DB04-place-move-exclusion-and-targeted-undo | PASS |
| DB05-undo-refuses-overwriting-later-human-edit | PASS |
| DB06-undo-does-not-restore-whole-snapshot | PASS |
| DB07-two-connections-CAS-one-winner | PASS |
| DB08-operation-idempotence-does-not-return-stale-snapshot | PASS |
| DB09-scope-A-B-same-native-id-isolation | PASS |
| DB10-unknown-scope-never-opens-workspace | PASS |
| DB11-human-lock-and-exclusion-protect-against-candidate | PASS |
| DB12-stale-candidate-global-revision-rejected | PASS |
| DB13-revoke-source-reprojects-without-erasing-intent | PASS |
| DB14-coverage-stales-and-does-not-fabricate-activity | PASS |
| DB15-old-window-stays-parent-not-duplicated | PASS |
| DB16-label-is-not-evidence-authority | PASS |
| DB17-guard-denial-and-aborted-write | PASS |
| DB18-view-preferences-reopen-and-CAS | PASS |
| DB19-corruption-refused-with-explicit-checkpoint-recovery | PASS |
| DB20-corrupt-state-cannot-be-overwritten-by-normal-command | PASS |
| DB21-bootstrap-replay-never-resets-human-data | PASS |
| DB22-unsupported-official-format-not-guessed | PASS |
| DB23-hash-valid-but-schema-invalid-refused | PASS |
| DB24-pressure-120-themes-604-refs-128-members | PASS |
| DB25-ingest-new-send-activates-old-theme-and-retains-old-children | PASS |
| DB26-conflicting-provenance-and-revocation-recomputes | PASS |
| DB27-native-source-conflict-is-atomic | PASS |
| DB28-workspace-history-aliases-persist | PASS |
| DB29-corrupt-B-operation-does-not-poison-A-history | PASS |
| NATIVE-command-revoke-after-put-rolls-back | PASS |
| NATIVE-command-revoke-after-commit-does-not-report-success | PASS |
| NATIVE-view-revoke-after-put-rolls-back | PASS |
| NATIVE-actual-transaction-abort-never-reports-success | PASS |
| NATIVE-corrupt-view-checksum-isolated | PASS |
| NATIVE-corrupt-view-schema-isolated | PASS |
| NATIVE-recovery-does-not-resurrect-evidence-or-receipts | PASS |
| NATIVE-recovery-revoke-after-put-remains-corrupt | PASS |
| NATIVE-v1-upgrade-preserves-ref | PASS |
| NATIVE-invalid-v1-upgrade-rollback | PASS |

### 正常 URL 页面17项

| 项目 | 结果 |
|---|---|
| native-components-after-write | PASS |
| native-create-rename-icon-place-move-undo | PASS |
| native-input-messages-tool-interaction-identity | PASS |
| native-assets-after-manual-edits | PASS |
| actual-page-reload-persistence | PASS |
| native-assets-reload | PASS |
| new-tab-persistence | PASS |
| native-assets-new-tab | PASS |
| native-workspace-placement-B-isolation | PASS |
| actual-A-B-A-isolation | PASS |
| native-two-tabs-UI-CAS-and-failure-status | PASS |
| native-delayed-real-read-then-new-human-command | PASS |
| actual-native-IDB-two-connection-CAS | PASS |
| native-assets-corrupt-view-reload | PASS |
| native-corrupt-view-UI-diagnostic-draft-and-byte-preservation | PASS |
| native-real-delayed-old-response-after-unknown | PASS |
| unknown-scope-fail-closed | PASS |

### 真实 MV3 19项

| 项目 | 结果 |
|---|---|
| native-components-after-write | PASS |
| native-create-rename-icon-place-move-undo | PASS |
| native-input-messages-tool-interaction-identity | PASS |
| native-assets-after-manual-edits | PASS |
| actual-page-reload-persistence | PASS |
| native-assets-reload | PASS |
| new-tab-persistence | PASS |
| native-assets-new-tab | PASS |
| native-workspace-placement-B-isolation | PASS |
| actual-A-B-A-isolation | PASS |
| native-two-tabs-UI-CAS-and-failure-status | PASS |
| actual-worker-cold-message-restart-old-lease-denied | PASS |
| actual-worker-stop-restart-persistence | PASS |
| native-assets-worker-restart | PASS |
| native-assets-corrupt-view-reload | PASS |
| native-corrupt-view-UI-diagnostic-draft-and-byte-preservation | PASS |
| native-unknown-content-to-worker-binding-denied | PASS |
| native-real-delayed-old-response-after-unknown | PASS |
| unknown-scope-fail-closed | PASS |
