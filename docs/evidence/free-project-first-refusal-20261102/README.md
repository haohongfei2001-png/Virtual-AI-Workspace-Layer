# Project 首次 wrapper 拒绝：正式诊断接线

本批只交付诊断候选。真实 wrapper 布局缺陷尚未确定，不修订布局合同，不标记 `SOURCE_FIXED` 或 `FREE_ACCEPTED`。原 Mac 交接目录在远程环境不可访问；没有读取或执行其中离线 bundle，按用户指令和正式源码独立实现。

源码基线：`1903b00f774b4fd7f3d15b3669878c32e2c7a9c8`。原分支、PR #16 和 Draft 保持。精确候选 SHA 与同 SHA push CI 由 PR 当前交接记录绑定；不为追加 CI 结果制造下一候选提交。完整 CI 成功后，最终状态才是 **DIAGNOSTIC_CODE_READY / LIVE_NOT_AUTHORIZED**。

## 接线与授权

`captureNativeBaseline()` 原同步失败路径直接向内部 `onDiagnostic(report, context)` 提供当次 document、inspection、root、拒绝 node、reason/detail/phase/kind 和原 flowSeam.shells 引用。上下文只读且回调退出后引用撤销；不从匿名报告反推、投影 DOM、使用 Proxy 或重复调用预检。旧消费者在 surface 组合层仍只收到原匿名 report。原 `native-flow-diagnostic.mjs` 未修改。

`projectWrapperDiagnostic` 构建选项默认 false，与旧首页诊断互斥。专用诊断包在首个 Host 会话建立后、HELLO/原生检查前等待本次私有授权；普通包按原流程运行。等待期不安装旧 BrowserLocal 生命周期观察器，不开放旧侧栏/历史诊断旁路。授权后安装原安全生命周期并恢复原 HELLO、REFRESH、布局和挂载路径，未替换身份、grant、frame 或 epoch 检查。

新固定批次 key 为 `vaiwl-project-first-wrapper-refusal-20261102-v1`。只在扩展来源的 `navigator.locks` 锁内读取/写入该 key 的 `{spent:true}`。不持久化报告、nonce、文档身份或 URL，不读写旧 36/36 或 Project 1/1 账本。私有 status 按指定 browser documentId 发送请求，内容端同时检查扩展 sender、精确 status.html 来源、无 tab sender、当前会话 nonce、文档、路由和代次。存储迟到、丢失回复、失败或超时都不自动重试。

等待授权最多 60 秒，授权后最多 30 秒。首次正式预检即消费 RAM 门：仅 Project 的 `native-flow-wrapper-paint` 会生成匿名路径和局部证据；首次接受或其他拒绝终结为 `NO_MATCH`。路由 A→B→A、pagehide/BFCache、会话更换、文档更换或期限失效均不能复用。异步回复回程再读一次缓存，已失效代次优先于延迟成功回复。

## 输出合同与隐私范围

输出为 `vaiwl-project-wrapper-snapshot-v1`，含构建指纹、固定 route/documentBinding 类别和严格验证的 `project-wrapper-first-refusal-v1` report。没有原生引用、HTML、文本、标题、输入值、附件、私人 ID、URL、网络数据或异常文本。

report 为 COMPLETE、PARTIAL 或固定终态 NO_MATCH / FAILED / EXPIRED / INVALIDATED。实际目标 report 保留原始匿名 baseline；最多三行局部节点依次对应被拒节点、父节点、祖父节点。每行只有距离、固定 tag、是否原 root、是否原 shells 成员、有界整数矩形和固定样式类别。伪元素 content 和任何可能含 CSS URL 的值不原样输出。

保留原 128 walk、16 层路径、24 行上限和原 8ms 诊断预算；新三节点消费者共用该次 8ms 时间窗。原路径深度/容量/时间不足时保留 PARTIAL，即使局部三节点完整也不改为完整路径证据。新增消费者零正文/标题/输入等字段读取、零子孙/兄弟扫描、零节点写入；授权后原 Host 的既有 BrowserLocal 导航读取不冒称为新消费者的零读取结果。

## 已执行验证

| 门 | 实际结果 |
| --- | --- |
| 定向 Node 合同 | 13 文件，675/675，通过；包括旧诊断 7/7、新门 18/18 |
| 固定父 SHA RED | 4 detail × 9/16/24/40 层共 16 例，旧代码均缺原始第二参数 |
| 当前源码 GREEN | 16 例取得实际同一 document/inspection/root/node/shells；原 reason/detail/phase/visited 一致 |
| 回调隔离 | 64 个消费者变体，其中 32 次实际抛异常；准入结果、原生 DOM 不变，引用退出后撤销 |
| 128 节点边界 | 原、新均 visited=129、node-capacity；新 scoped 消费者 NO_MATCH、无新增矩形读取 |
| 实际专用 MV3 | 10 项检查通过，含显式一次授权、原生产首拒、缓存读取、实际 JSON 下载、A→B→A、Reload 不重放 |
| 实际普通 MV3 连续旅程 | 36 项记录通过，覆盖 Project、home、conversation、输入/草稿、返回、生命周期与恢复 |
| 独立源码复审 | 两项发现已修正；最终生产十文件哈希见 receipt，无剩余提交阻断 |
| 同 SHA 正式 CI | 原 push 工作流；须核对全部 42 jobs，不能用默认第一页 30 条代替 |

原 Mac 的 18 个旧失败反例和 16 个离线回调验证仅继承为用户提供的事实，不冒充本轮执行。首次本地测试发现的夹具与测试边界问题已在 [receipt.json](receipt.json) 保留，未通过放宽生产条件解决。

证据：[callback-matrix.json](callback-matrix.json)、[diagnostic-mv3.json](diagnostic-mv3.json)、[normal-mv3.json](normal-mv3.json)、[source-input-hashes.json](source-input-hashes.json)。所有 210 个生产输入都与最终本地测试包及生产诊断包逐项匹配。

未来实机的最小操作见 [HANDOFF.md](HANDOFF.md)。本轮未访问、安装、Reload、授权或操作真实 Mac Chrome；真实取证 **NOT_RUN / LIVE_NOT_AUTHORIZED**，原 Project 挂载仍未修复、Free 未验收。
