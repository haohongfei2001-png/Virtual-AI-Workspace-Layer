# 数据模型：共享原生事实、Free投影、Pro资产

2026-10-13整合。设计合同，不是已执行迁移。任务归属见[开发计划](DEVELOPMENT_PLAN.md)B1–B5，显示机制见[核心规范](CORE_MECHANISMS_V2_8.md)。Free不再使用独立虚拟Workspace作为原生Project的主键或成员来源。

## 1. 基线代码与必须修复的接口

`src/data/schema.mjs`当前DATABASE_VERSION=2，B1与B23同库；TABLES为refs/sources/events/coverage/workspaces/placements/identities/preferences。`state.mjs`只允许none/synthetic通道，INGEST遇到已存同ID的标题/归属变化会报native-reference-conflict。`evidence.mjs`从workspaces/placements构造主题，并以identities.title覆盖nativeTitle。F1在同库扩展分区根/页和增量复制。

需要新增的是生产原生观察的受控入口、项目实体/成员三态及Free投影，而不是删除已有Workspace表或把synthetic字符串改成trusted。旧Workspace/Placement/Identity及其人工作品继续保存为Pro资产。测试种子中的projectId=null没有生产证明，不得迁移后自动认定为原生无项目。

## 2. 共享事实模型

| 对象 | 键与主要字段 | 权威及约束 |
|---|---|---|
| Scope/HostBinding | provider/account/nativeOrganization，epoch、documentId/frameId、当前browserRoute、expiry | 身份须独立核验；Profile/头像/URL标签不证明当前账号；不备份为授权 |
| NativeProjectRef | `(scope,nativeProjectId)`，nativeName、原生URL、可用性/权限观察、原生图标、sourceRevision/observedAt | nativeName不是主键；同名不合并，改名不改ID；原生Project不是API平台Project或VirtualTopic |
| ConversationRef | `(scope,nativeConversationId)`，nativeTitle、原生URL、availability、nativeRevision、sourceWitness | 标题始终取最新有效原生观察；权限未知/删除与暂时未发现不同；不持久复制助手正文或草稿 |
| MembershipObservation | refKey、state=`PROJECT/NONE/UNKNOWN`、projectKey可空、source、revision、observedAt、有效期 | PROJECT必须有同scope项目ID；NONE必须有正向无归属依据；UNKNOWN不可改写成null假无项目 |
| InventoryCoverage | scope、渠道、分页游标/结束见证、项目与聊天覆盖、已知/未知缺口、asOf、revision | 枚举完整性与消息完整性分开；未见记录不等于删除；不从旧文件宣称当前全账户 |
| UserSendEvent/TimeCoverage | 既有message/branch/author/role/committed/kind、sentAt或时间范围、精度、来源/撤权及覆盖 | 原始时间与观察时刻分离；真实来源必须经特权适配核验；保留旧合成证据标签 |
| ObservationHint | ref/projectKey、hintType、sourceWitness、eventKey、observedAt、candidateInterval可空、sourceRevision、validUntil | 仅用于可逆排序。访问/轮询不生成新活动；新的抓取时间不能续写旧事件的活动日期 |
| ActivityDecision | objectKey、evidenceRevision、exact/interval/provisional/undated、candidateDay可空、segment可空、reason、nextCheck | 可重算非事实；从不写回sentAt或native membership；过期不自动变成确定不活跃 |
| FreeViewPreferences/ViewSession | H/模式/手工锁、sidebar/旧窗口/容量、T/Z/policyRev、anchorRef/scroll | 单一偏好所有者；跨tab新策略不误解释旧k；固定/当前可达不改活动 |

Availability需至少区分available/unavailable/unknown，原生删除需要对应见证；source消失时保留资产并隐藏无权信息，不借历史缓存绕过权限。

原始send的消息级日期精度不够时可保留区间，只有整个区间落在同一段才作确定分段；否则给显示层不确定信息。当前肯定新发送但原始时间未证实，可形成ObservationHint支持即时recent，不造UserSendEvent。共享Project的其他成员输入不能自动被记作本人。

## 3. Free投影及原生变化

FreeProjectCard由NativeProjectRef和当前有效MembershipObservation的PROJECT成员构建；标题只取nativeName，行只取nativeTitle。不访问workspaces/placements/identities来推断真实成员或显示名。

无项目区只放确认NONE的引用；UNKNOWN记录在正常原始清单中可达并待核对，不能遗漏或同一行同时显示为两个确定父级。来源未读取到原名时，只能显示最后一次有效原名或明确的“名称暂不可用”占位，不能调AI/拿Pro标题填补。

新增受控命令合同（名称为拟定）：APPLY_NATIVE_OBSERVATIONS、INVALIDATE_NATIVE_SOURCE、COMMIT_ACTIVITY_DECISIONS、SET_FREE_PREFERENCE。原生观察可更新同ID标题/成员，记录旧原生名用于可选查找，不套用仅供合成导入的冲突处理。相同source revision乱序回包拒绝；无原生revision时用当前source-generation/账户epoch与读回核验，不以本机较晚抓取时间强行覆盖更可靠来源。

成员从NONE移入Project、Project间移动、移出Project及原生删除，按一次一致快照更新项目卡/无项目列表/活动聚合/缓存。Pro虚拟Placement若失去其NONE资格则停用默认Pro显示并保留旧人工记录，不能继续把它伪装无项目或逆向移动原生对话。

无需建立另一个事实数据库。可在同库增加native_projects/native_membership/observations等逻辑存储，具体store名在迁移切片固定；F1新分区根写入的是这些共享事实/证据。数据格式版本、IDB版本、view policy和Pro资产版本分别管理，不能靠统一字符串默认兼容。

## 4. Pro持久资产完整保留

VirtualTopic可承接旧Workspace，VirtualPlacement承接旧Placement，DerivedTitle承接DisplayIdentity；需标明虚拟命名空间和来源版本，不能原样把ID写成nativeProjectId。保留人工name/aliases/icon/order/owner/lock、include/exclude、Series、redirect和可撤销重组。

默认Pro处理确认NONE的引用；跨Project聚合属于显式后续模式，不改变FreeProjectCard。多虚拟归属使用用户点击的LaunchContext，不能用current-index的first-match冒充唯一来路。系列编号区别软件版本和对话续接，旧记录首次发现不自动编号。

免费降级只停止读取/应用Pro overlay，原生标题/成员立即回归；历史Pro资产受原scope保护、可安全备份但不在Free显示成虚拟主题。模型建议和人工资产权限分离，候选不得标actor=human越过锁。

## 5. 同库迁移、并发与恢复

下一版本从已核实v2演进，版本号实施前重新分配；不先在文档占用v3又覆盖其他执行者。步骤：校验原库/分片根 → 短事务新增结构/格式标识 → 逐块迁入可核验原生事实 → 原子根/CAS切换 → 新reader验证 → 开放写入。F1旧20k表/16Mi单记录/5000项有界页及6秒请求限制不是迁移时可忽略的上限。

旧Pro资产字节/ID/人工作品不删除；旧synthetic引用仍synthetic。只有可靠Project观察才能建立Free映射；没有依据的旧Project字段迁入UNKNOWN待校验，不按标题或虚拟分组凑齐。迁移失败保留旧有效根，不清空库重建。

旧reader看到新schema必须只读或拒绝写；两个版本/两个tab版本协商，versionchange关闭旧连接。配额、崩溃、root/日志损坏、撤权与写入交错都要反例，不宣称所有账户切换与IDB commit天然原子。复用B4前后栅栏/事务中止与B5校验，而不是降低断言。

B5备份继续是有界人工资产和必要引用，不是全部聊天历史镜像。可备份Free手工范围/工作集/原始引用及Pro人工作品；恢复不激活原生grant、ObservationHint为可信时间、pending模型写入或自动重试。原生项目/成员和密度样本恢复后重验；不能因恢复到新安装就重置已派发原生任务预算。

## 6. 原生动作账本（可选E，不是Free元数据）

代理创建/改名若将来实施，ExecutionIntent、授权和回执放独立逻辑域：scope/准确目标/planHash/次数/时限/阶段/UNKNOWN。点击原生入口由用户原生操作，不自动形成一份扩展代发许可。

默认原生读显示、用户原生新建与VAIWL代理写入各自分层。已派发但结果未知先只读核对，不重试创建；取消不删除已建Project；本地Placement撤销不执行原生删除/移动。独立Profile/设备无共享账本时不能宣称全局exactly-once。
