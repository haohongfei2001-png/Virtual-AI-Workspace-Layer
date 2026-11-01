# Round380：owned presentation 切换保留有限目录游标

基线 a724a452a5f1cf098b544e2951b094d87b17dba9，原开发目录/分支/PR16；中断后核对真实工作区继续，没有丢弃修改或重建工作环境。

原因：adapter本已在确切owned toggle且没有待处理原生失效时要求保留目录进度，但discovery将当前可见Project/Conversation ID当作游标身份。开启owned mask使Project从P变null，旧cursor被拒绝并从头扫。

修复仅增加当前普通opaque cursor的一次性presentation标记，由上述adapter路径调用。下次scan消耗旧token并要求route/region及原pass结构快照的节点、父关系、ID属性、标题不变；marker只允许可见ID变化，不刷新结构基线。不读取巨大成员根textContent。candidate-only、foreign、consumed cursor不能标记；原生结构变化继续拒绝。每项PROJECT/NONE仍按原逻辑检查当前可见性，保存ID不提供成员授权，遮罩下新成员仍UNKNOWN。

独立12项原源红基线1PASS/11FAIL（API缺失）保留；最终独立14项通过，含一次消费、先无变化消费再原生隐藏仍拒绝。旧603包测试在unmask时原始可见第一页被合法去重，修正为已观察255与新鲜未见成员组合；所有新成员仍要求fresh visible claim，hidden反例不减少。共享fixture抽取以接真实owner/repository，不改变旧数据或时钟。

新持久链测试通过：真实HostObservationOwner、NativeRepository、转换/投影/Free页面，明确offline授权替身+MockIDB。603精确refs、255PROJECT/348UNKNOWN、后续masked rescan不降级、同库重开保持、原名保持；5/17分页与repository loader每批200可达。直接200长标题DTO超过64KiB的初始误预期红测保留；真实FreeFrameClient按既有保护自动缩页后完整遍历全部603，无重复。没有修掉或放宽大小保护。该2项仅L请求/DTO链，不是D或renderer/S认证。

本轮原100k single-project CPU1 gate仅跑一次，仍 **FAIL / NOT_RUN_INDEX_NOT_READY**：原生tail及时可达、5/17 Project card样本通过，但完整审计仅4151 refs、255PROJECT、3896UNKNOWN、95849missing、0wrong。source/fixture/manifest未漂移、原deadline/gate不变；该时点样本不是吞吐度量，也不能与Round343样本直接比较宣称性能提升。未放宽可见性、增加准备等待或把UNKNOWN提升为PROJECT。

最终完整Node **7202/7202 PASS**、零skip/cancel；独立源及持久链审查通过。源码与测试hash归档，100k原始FAIL保留。完整100k、UI11/J1–J4/81/G/U及Free仍NOT_RELEASE_READY。
