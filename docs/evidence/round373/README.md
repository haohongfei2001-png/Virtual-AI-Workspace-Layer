# Round373：无额外预算准备的 after-Evidence 旧版拒写与再升级

基线 d9eb9e3db85558f5103ba389cd078b7178e5d986；执行前独立 GitHub API 确认原 Draft PR #16 同 HEAD、原 base 不变，正式开发分支已跟踪工作区干净。原整理 stash 与未跟踪副本保留。本轮不改生产源码。

新增独立互斥 FREE_J4_UNPREPARED_AFTER_EVIDENCE_CODEC=1，实际传 preparedBudget=false、afterEvidence=true、codecScenario=AFTER_EVIDENCE。所有旧开关语义与失败判定保持；无准备仅指 baseline 前不增加预算准备等待，后续原有窗口等待仍保留。

实际新隔离 Profile、headless Chrome、本地 MODERN C2 fixture 打包 MV3 单次连续运行 **26/26 步骤 PASS**，正常退出2，仍为 PARTIAL_J4_NOT_ACCEPTED。原 runner 与报告 hash 对齐，sourceChangedDuringRun=false、buildManifestUnchanged=true、errors=[]。没有访问真实 ChatGPT 或日常 Chrome。

同一个已完成 evidence、尚未 complete 的 native continuation，经实际停 worker 和同 ID 旧包装载：历史 a8addaa9 的真实 owner 在 open/listContinuations/invalidate 三处均 VersionError，原八表摘要、pending 与已提交 receipt 不变。恢复当前包实际加载字节后，新 grant 使 continuation complete；原 ACK、firstObservedAt、receipt 不变，无原生发送重放。后续 Evidence 损坏/修复、新的真实 fixture send、索引损坏/修复、撤权、disable/reenable/uninstall、原生编辑器与草稿检查均在同一趟执行。

codec 后 peer 通过明确的空草稿原生 context 切换重新建立 Team，再明确恢复 Personal；报告 automaticReattachment=NOT_ESTABLISHED。这不是无操作自动附着成功，不以该步骤掩盖相应未完成条件。旧包拒绝证明实际数据库版本栅栏，并不单独证明同版本任意记录 codec 的拒绝。

全部 J4 相关 Node **311/311 PASS**，零跳过/取消。原始报告、运行日志、精确执行 runner、相关 Node 输出均归档；测试入口的两处包轮换复用既有 helper，不修改生产 schema 或授权。

本轮不将 Round347/312 相加认证完整 J4；未认证剩余 profile/lifecycle 矩阵、re-enable 稳定性、即时 cold context、100k 完整库存、自然 worker 退出原因及其余81项/G/U。Free 继续 NOT_RELEASE_READY。

并行补充 tail 优先→真实 owned toggle 形状→候选读取→继承遮罩→解除遮罩的 L 发包回归 **2/2 PASS**：603 个候选 ID 精确齐全；初始可见页之外348个 ID 的后续包明确 UNKNOWN，PROJECT 不超出初始可见255个；解除遮罩后的新包精确603个 PROJECT，宿主主动隐藏反例为602个 PROJECT及1个明确UNKNOWN。使用 DOM double 和真实 adapter/discovery/fragment/surfaceBatch，不涉及真实数据库或UI，不把累计Map当成持久保留证据。

诊断确认原100k runner的遮罩来自实际“返回工作空间”产品操作；tail已出现不等于全部成员已观察。原Round343完整库存失败保留，未通过增加准备等待或放宽可见性改判；本轮未重跑100k，不产生性能结果。

修复段仍未覆盖 PENDING_REPAIR_TO_NEEDS_REVALIDATION、missingInitialACKSourceContinuation 和未加载 branch 等反例；具体 NOT_COVERED 保留在原报告。
