# 技术架构：Free原生事实投影优先

同一扩展、同一受保护数据库、两个展示模式。现有源码仍为合成宿主与虚拟Workspace原型工程；此文明确Free需要新增的边界和复用点，不声明生产适配已经成立。

## 1. 共享管道与分级出口

获准HostAdapter → 当前Scope/DocumentGate → NativeObservationValidator → 同库NativeProject/Conversation/Membership/Activity事实 → FreeProjector → 现有navigation组件。

Pro在共享事实之后另接EvidencePack → Candidate/Model → ConstraintReducer → VirtualTopic/DerivedTitle → ProOverlay。Free路径不能调用模型、读取派生标题/虚拟成员或依赖会员网络请求才能渲染。Pro停用仅切换出口，不删除共享或Pro人工资产。

当前`simulator/service.mjs`显式绑定syntheticURL/scopeOf/persistentSeed，是测试服务，不可更改域名后就当生产HostAdapter。原native事实必须有真实来源证明；页面传入的verified/trust标签不能自证。

## 2. 生产数据问题先验证，但本地工程不空等

R0-01/02/03.F分别验证scope、清单/成员、活动与更新渠道；不把一个“有Project列表”的证据扩大成完整消息历史或正确时间。有效近期排序可能只需要可靠最近用户活动摘要，不要求下载全部正文；但摘要的作者/新发送/日期语义和更新范围必须实测。

默认不构造未公开内部历史/项目请求，不后台开大量隐藏tab、不绕账户/挑战/管理员限制。被动正常交互元数据也需单独说明范围。官方导出研究和旧导入代码保留，但不能成为Free日常初始化、周期补文件或人工维护方案；B5人工资产备份是不同功能。

当前未建立普通扩展可用的原生Project创建/全量历史API证据；不把API平台projects接口当ChatGPT接口。来源不成立则报告具体BLOCKED和最小条件，同时继续Free投影/迁移/原生保留的独立工程；不得把UNKNOWN当成完成。

## 3. 原生观察更新与FreeProjector

当前INGEST拒绝旧引用的任何变化，且主题从workspaces/placements读取，这是Free差额。新增受控NativeObservation命令处理原名/真实成员/权限/删除/新引用，事务/CAS与F1分片根复用；不把原生变更伪装为用户虚拟MOVE/SET_TITLE。

Free投影基于(scope,nativeProjectId)建立卡片，NONE清单与UNKNOWN可达项分流；按核心规范ActivityDecision排序，原名唯一显示来源。Project更名不重建卡片ID，移动聊天会从旧父容器删除引用并加到新父，不能两处都自称权威成员。

缓存键至少(scope,epoch,nativeRevision,membershipRevision,evidenceRevision,H,T,Z,policyRev,viewMode)；原生标题变更只更新受影响节点，成员/活动变更增量重算，Pro切换不能复用错误模式的缓存。现有路由first-match若对应多个虚拟主题只在Pro使用明确LaunchContext；Free直接由核验原生项目决定上下文。

## 4. 活跃引擎与非阻塞校准

严格UserSendEvent/TimeCoverage不变，ObservationHint/ActivityDecision不写回事实层。可靠历史日期可以支持可逆旧段显示，未知完整性不强制项目永远近期；完全无日期不因时间到了猜一个历史段。所有候选依据/TTL/源版本可在诊断查看，日常UI无逐条元数据。

调度器先渲染同scope有效缓存，再有界请求；新发送/身份失效优先，慢历史分批；单请求保留6秒边界，有限重试和退避，过期完成回包拒绝。重复轮询/重启不能延长旧活动锚；借主线程永久保活worker不是恢复方案。

当前最近Project活动=max(有效本人活动成员)，不是项目文件/AI时间。手机/其他端变化经经验证渠道返回后触发增量更新；没有远端来源时清楚区分源未更新与本地算法迟缓。完整Free必须在真实受控样本中证明典型收敛，而不是以“可查到”代替默认排序正确。

H选择为确定性本地统计，不用模型。5H复用一次活动索引/直方图，不复制五份100k集合；historical density必须用当时rollup/完整历史事件，不能把今天lastSend回投过去。历史ViewSession固定H/T/Z，policy更新原子但不强制重排已在浏览的tab。

## 5. 原生UI与新建

VAIWL只拥有导航根和必要的扩展设置/提示。原transcript/composer/model/tool/portal/生成状态都留宿主，不重建也不移入自制聊天壳。边界不可识别时撤下扩展接管区域并保留原生。

Free项目＋打开已核验真实Project原生入口；用户完成创建/发送，由后验观察关联。新Project按钮不是后台自动创建任务。若以后做代理创建/改名，使用独立E IntentCoordinator、可信审阅、task-wide预算及UNKNOWN不重发，不能接受模型任意工具动作；缺能力不妨碍Free的原生流程。

## 6. 存储、版本与兼容

保留现有B1/B23数据库、B4 CAS/幂等/inverse、B5检查点/人工补丁/有界备份、F1不可变分片/root与bounded RPC。下一schema号实现前核对。旧Pro人工作品原样保留并从Free出口隔离；source trust不会因迁移而提升。

设计不放宽20k旧表/16Mi单记录/6秒消息/20秒lease限制。迁移与大规模更新短事务/分块/CAS根切换，旧reader拒绝不支持schema。权限撤回、配额、损坏、写中撤权和两个版本并存仍需回归；不证明远端与本地完全原子。

## 7. 实现/验收边界

纯逻辑、模拟DOM、真实IDB、真实Chrome MV3合成宿主、真实访客、真实账户、物理IME/真人可用性分别记录。旧合成100k、B4真实冻结事件、旧Chrome DOM通过保留但不认证Free已上线。

C6/F1/F3按Free自身启用能力验收，不再等待D/E/F2。PAIA运行共存前置于完整Free验收，但PAIA数据协议后置；不共享其数据库/授权/提示词/视觉。受限账户类别明确进入支持矩阵，不用发布文案泛化。
