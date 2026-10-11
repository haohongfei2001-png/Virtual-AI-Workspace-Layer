# F1 实际 MV3 容量与性能增量

裁决 LIMITED。保留原120主题/604窗口，在全新隔离Chrome/扩展自身IndexedDB上追加到1k/10k/100k引用，不缩样本、不以mock冒充存储。1k/10k本次实测通过原E9导航/搜索目标；100k未通过当前容量限制，仍是代码缺口。

## 原失败与最小修复

`before` 三项失败来自测试驱动在扩展service worker使用不支持的动态import，尚未写测试状态；修复为仅临时测试build的静态imports，正常worker源码不添加测试入口。`baseline-static-driver` 才是有效产品基线：1k通过，10k真实快照7093.2ms且页面无法进入ACTIVE，100k拒绝超限。保留所有原报告/截图。

性能修复只给每次投影建立局部ref/workspace事件、覆盖、placement索引，并缓存最多16个Intl.DateTimeFormat时区格式器。没有缓存scope状态、旧发送权限或跨重启投影，不更改CAS/幂等/撤销/20秒lease。`tests/f1/equivalence.test.mjs` 与已验收C34提交38ea47d逐一深比较A/B、上海/纽约、撤权/冲突/无日期/覆盖缺口/排除的结果，另有完整既有合同验证。

| 原F1档位 | 实际结果 | snapshot | 相邻30日UI切换p95 | 已知派生搜索首屏p95 |
|---|---|---:|---:|---:|
| 1k refs / 120主题 | PASS | 45.9ms | 41.7ms | 32.4ms |
| 10k refs / 120主题 | PASS | 457.8ms | 50.0ms | 32.3ms |
| 100k refs / 120主题 | BLOCKED | 未进入快照 | 未测 | 未测 |

`after-index/results.json`保存20次相邻区间切换、10次搜索首屏原值及写入/快照时间，阈值仍导航p95<150ms、搜索<300ms。额外引用为受控合成metadata；真实原生宿主仍604会话数据，不能宣称完成10k独立聊天正文、真实远端路由加载、弱设备或大规模多tab测量。样本量和p95算法在驱动中固定，此处不是低端设备/所有用户性能保证。

100k当前被`validateState`每表20000行及整状态16777216 UTF-16 JSON码元护栏阻塞；不是Chrome加载失败/OS配额穷尽。旧原报告字段`configuredStateBytes`命名不准，原件不改；`capacity-final-units`已更正为`configuredStateJsonCodeUnits`。最新容量测试在真实扩展IDB先写原604引用+人工标题，再尝试100k，确认超限拒绝后完整保留既有人工数据。未降低目标或直接扩大安全护栏。

## 最后实际运行与覆盖

| 层级 | 当前源码最终结果 | 原始证据 |
|---|---|---|
| Node独立合同+新差分 | 135/135 PASS | regression/0.log |
| Chromium DOM | 49/49 PASS，mock IDB层不是存储证据 | regression/dom |
| 原生IndexedDB | 54/54 PASS，外层1项含54个逐项结果 | regression/db.json |
| 正常页面持久化 | 17/17 PASS | regression/page.json |
| 真正MV3/worker/扩展IDB | 19/19 PASS | regression/mv3.json |
| 原设计C1全UI | 10/10 PASS | final-journeys/c1 |
| B5文件/dry-run/实际停止worker/冷启动 | 3/3 PASS | final-journeys/b5 |
| C34工作集/手工片段/隔离 | 3/3 PASS | final-journeys/c34 |
| C5实际200%/键盘/边缘 | 2/2 PASS | final-journeys/c5 |
| B4 lease/失效绑定/多tab/冲突 | 5/5 PASS | final-journeys/b4-core.json |
| B4真正隐藏/冻结/恢复 | 1/1 PASS | final-journeys/b4-lifecycle.json |

命令清单原件`regression/commands.json`、`final-journeys/commands.json`；每一真实报告记录实际source/build SHA256及Chrome环境，最后source/runtime提交801595e。性能运行时修复尚未提交时的gitHead仍3afaf33，须以报告实际sourceHashes对照，不把旧HEAD当未修改源码。最终证据manifest独立校验，不覆盖各阶段历史原始hash。

环境macOS27.0 26A428、Chrome154.0.8037.99、Node26.8.2、Python3.14.7、Playwright1.63.0；仅全新headless Profile与owned CDP/loopback，未抢日常浏览器焦点、读取私人聊天、操作PAIA或付费调用。原生输入/草稿/消息/工具所有权仍通过既有旅程。

F1还需：安全处理100k容量，补大规模多tab、长中文/长聊天交互与弱设备覆盖；不能用此增量宣布F1/F3/F4或整个A–G完成。GitHTTPS发布阻塞另见git-explicit-helper.log及git-process-trace.log，本地提交和bundle保存；不伪称新PR已经创建。
