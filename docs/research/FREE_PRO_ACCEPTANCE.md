# Free与Pro验收矩阵：同一计划的退出条件

本文件正式采用[VA-HOST/1.1 FINAL完整工程规格](../specs/chatgpt-host/VAIWL_CHATGPT_HOST_SPEC.md)、[类型合同](../specs/chatgpt-host/VAIWL_HOST_CONTRACTS.d.ts)和[81项完整离线验收](../specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md)。原FR-01–15、PR-01–07与81个Host case ID均保留。唯一执行路线仍为[DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md)；本页定义退出与逐项任务映射，附件保存全部场景、预期、失败判据和自动化细则，不建立第二套测试要求或开发路线。

这是验收要求的正式整合，不是一次测试运行，不修改任何既有STATUS或结果。附件内的日期、Round60/1125等历史记录只属于其原审查基线；最新运行由实际源码/工程证据决定，不据本次采纳增加PASS或重新评定旧成果。

## 1. 证据与支持范围

L=纯逻辑/严格schema；D=真实IndexedDB事务；S=真实Chrome MV3及本地synthetic/native-shaped宿主；G=实际获准ChatGPT；U=真人/物理IME/实际PAIA/日常旅程。普通Chromium set_content的Web机制probe仅为WEB_MECHANISM_ONLY，不计S，不升级G。已有结果继续按原源码、构建和环境归档，不把多次定向运行数量相加为一次全套。

P0失败阻断首个生产接入切片，P1失败阻断完整离线候选，P2须在所属F1/F3退出前解决或保留明确未达标状态。case及全部子场景逐项PASS/FAIL/NOT_RUN；不能让一个子场景PASS覆盖同ID其他失败，缺环境不得以mock补绿。

正常profile的正向分母由独立oracle事先固定：该旅程实际暴露且在支持范围内、有充分可取得证据的对象/成员/动作。页面只加载25/1000项，分母为25且必须全部可达，不伪称已发现1000；未加载余项仍保留原生搜索/目录通路。IDless初态允许可点击候选，取得exactID后终态必须提升；带合格身份/NONE/消息元数据的样本不能一律拒绝或undated。

完整Free profile必须闭合principal/context、P/C身份、普通NONE、本人活动、原生导航/新建/搜索、完整v2.7与无损退出。FAULT故障族可以按预定规则降级；不得在实现后把正常LEGACY/MODERN/PARTIAL族改成unsupported迎合结果。大面积UNKNOWN/NATIVE_ONLY、核心来源缺失、持续误放或用户周期性手工补文件不能成为完整Free的“合法不适用”。

## 2. Free的15组验收

| ID | 原任务依赖 | 必须覆盖的完整断言 | 退出证据 |
|---|---|---|---|
| FR-01 | R0-01/03、B1.F、B2.F1、C1.F1、C2 | exact P ID、同名分离、改名/slug不换ID；无ID控件自然激活后可收敛；scope/权限/删除/未见分开；不从虚拟主题造P | L/D/S+G |
| FR-02 | B2.F1、C1.F1、R0-03 | PROJECT/NONE/UNKNOWN；普通C、customGPT、P内customGPT、移入移出/同名/改名；已知不漏列/重属，missing与未解释null不推NONE；正常NONE通路必须成功 | L/D/S+G |
| FR-03 | R0-02、B2.F1、C4 | 未打开/部分发现/未知归属仍有正常原始入口；原生搜索不被局部索引替代；权限不明不得泄露旧scope；虚拟卸载不删已知 | S+G |
| FR-04 | B3.F、C1/C4、B5.F | 库中存在Pro title/placement/旧缓存时Free仍只用原名；未知名不借Pro补；显示省略不伪完整原名；回Pro人工资产、工作集/片段不丢 | L/D/S |
| FR-05 | B2.F2、C1.F2 | 本人真实新发送及时recent；失败/optimistic/空composer/访问/AI/他人/IME不伪造；严格原始time与确证ACK观察锚分开；durable锚始终provisional、无sentAt | L/D/S+G |
| FR-06 | B2.F2、C1.F2 | 60天旧样本H30可逆下沉；有覆盖才confirmed，无覆盖provisional；完全无日期不因超时硬判old；新确证ACK不因校准due退回数月前 | L/S+G旧样本 |
| FR-07 | B2.F3、B4.F、B5.F | 重复轮询不刷新hint/观察锚起点；断网/缺字段/乱序/迟到有界结束；同scope跨lease/重启/多tab预算不归零，已知和当前操作不丢 | L/D/S+G |
| FR-08 | R0-02、B2.F3、C6 | 手机/另一获准原生客户端向旧P及NONE聊天发送后，桌面native正常可见的新证据自动纠正；updated_at仅dirty；上游可见和本地投影延迟分报，无真实源不能通过 | G，相关机制L/S |
| FR-09 | B2.F2、隐私合同 | updated_at/文件/标题/HTTP Date/访问/导入/旧编辑/重生成不算原始新发；message语义键不随observedAt/current leaf变，多ID块/作者/时间冲突/复制分支分别验证 | L/D/S+G语义 |
| FR-10 | B2.F2、C1.F3、C3、B3.F | H7/14/30/60/90、月末/闰年/DST、P子行一致、NONE自身分段；手工锁、auto证据不足/驻留/冷却/撤销、同值不抖、旧k不误用；原事实不变 | L/D/S+G可用性 |
| FR-11 | B4.F、C2/C3/C5、R0-04、F3 | 原生新建/返回/Back/Forward、20秒lease/worker重启、多tab、实际disable/uninstall/re-enable/freeze；manual双surface、限定声明式CSS、原生输入/焦点/草稿/弹层保持；nativeOperable/privateProjectionAbsent/cleanLayout分开，敏感残留不可用可关闭掩盖 | S+G；物理IME另U |
| FR-12 | B5.F、B4.F | 同库v2历史与当前v3/下一codec、Pro资产、root/log/桶损坏、配额、撤权前中后、版本混用；native+continuation/admission同CAS与evidence幂等续写；不清库、不复活source/grant/native动作 | L/D/S |
| FR-13 | R0-03、C2、B1.F | P内＋、全站新聊、新Project原生入口目的地正确；无ID控件可操作/提升；同步计划与一次dispatch；点击≠创建成功，取消不造卡，不自动补跳/发消息/同名重试/虚拟移动 | S+G |
| FR-14 | F1.F、C1/C4、B4/B5 | 保留120/604与1k/10k/100k、多NONE/mixed/单大P/长中文/多tab/4x/实际弱设备；末尾可达、原名/成员/活动增量不阻塞原生输入；复用staged loader/elapsed deadline/foreground，不两frame复制100k | S；真实环境性能另G/U |
| FR-15 | C6、F3/F4、G1兼容 | 零AI/无会员依赖完整日常；v2.7三列/5+12/连续侧栏/左旧项/唯一阅读返回/原名、历史/校正、工作集/片段/恢复、真实PAIA；Free↔Pro资产保持，不用残缺安全弹板代替 | G/U，包复现与对应L/D/S |

旧50/50、100k和历史MV3数字不直接填入本表的新Host能力。G旧样本不足先验证算法，但离线改时钟不能冒充真实60天；缺另一原生客户端不能把本机重发算跨端。物理IME/实际PAIA不得用占位或假事件升级。

## 3. 81项到唯一计划及FR的逐项对应

本表不复制场景正文；每项完整子场景、严重程度、预期和失败判据以[1.1 FINAL验收附件§4](../specs/chatgpt-host/VAIWL_OFFLINE_ACCEPTANCE.md)为准。主责任任务接线并维护实现，协同任务负责共同边界；所有行还纳入C6汇总，S生命周期/构建受F3约束。J1–J4及变异检查不另加case数量。

| Case ID | 原主责任/协同任务 | 对应FR |
|---|---|---|
| MAP-01 | B2.F1、C1 | FR-01 |
| MAP-02 | B2.F1、C2 | FR-01/02/13 |
| MAP-03 | B2.F1 | FR-02/03 |
| MAP-04 | B2.F1、R0-03 | FR-02 |
| MAP-05 | B2.F1、R0-03 | FR-01/02 |
| MAP-06 | B2.F1、C2 | FR-01/13 |
| MAP-07 | B1.F、B2.F1、C2 | FR-01/11/13 |
| MAP-08 | B2.F1、C2 | FR-01/03/13 |
| MAP-09 | B2.F1 | FR-01/02/03 |
| MAP-10 | B1.F、B2.F1 | FR-02/03/09 |
| MAP-11 | B2.F1 | FR-02 |
| MAP-12 | B2.F1、B5.F、C1/C4 | FR-01/04/14 |
| MAP-13 | B2.F1、B4.F | FR-01/02/07 |
| MAP-14 | B2.F1、B4.F、B5.F | FR-02/07/12 |
| MAP-15 | B2.F1、B5.F | FR-01/02/07 |
| INV-01 | B2.F1、C4 | FR-03 |
| INV-02 | B2.F1、B5.F | FR-02/03/07 |
| INV-03 | B2.F1、B5.F | FR-03/07 |
| INV-04 | B2.F1/F3、B4.F | FR-03/07 |
| INV-05 | B2.F1/F3 | FR-03/07/09 |
| INV-06 | B2.F1、B5.F | FR-03/06 |
| INV-07 | B1.F、B4.F、B5.F | FR-03/07/11/12 |
| INV-08 | B1.F、B2.F1、B5.F | FR-01/03/07/12 |
| INV-09 | B2.F1、C2 | FR-01/02/13 |
| SEC-01 | B1.F、B4.F、R0-01 | FR-01/11/12 |
| SEC-02 | B1.F、B2.F1 | FR-01/02/05/12 |
| SEC-03 | B1.F、R0-01 | FR-01/02/11 |
| SEC-04 | B1.F、B4.F、R0-01 | FR-01/02/11 |
| SEC-05 | B1.F、B4.F | FR-07/11/12 |
| SEC-06 | B1.F、B4.F、B5.F | FR-01/07/11/12 |
| SEC-07 | B1.F、C2/C3 | FR-01/09/11 |
| SEC-08 | B1.F、C2、F3 | FR-11/12/13 |
| SEC-09 | B1.F、C2、F3 | FR-11/12/15 |
| SEC-10 | B1.F、B5.F | FR-04/12 |
| SEC-11 | B1.F、B5.F | FR-04/12/15 |
| SEC-12 | B1.F、B4.F、B2.F3 | FR-07/11/12 |
| ACT-01 | B2.F2、C3、R0-04 | FR-05/09/11 |
| ACT-02 | B2.F2 | FR-05/09 |
| ACT-03 | B2.F2 | FR-05/09 |
| ACT-04 | B2.F2、R0-02 | FR-05/09 |
| ACT-05 | B2.F2、C1.F2 | FR-05/09/10 |
| ACT-06 | B2.F2 | FR-06/09 |
| ACT-07 | B2.F2 | FR-05/09 |
| ACT-08 | B2.F2、B4.F、B5.F | FR-05/06/07/12 |
| ACT-09 | B2.F2、B5.F | FR-05/09/12 |
| ACT-10 | B2.F2、C5 | FR-05/09/11 |
| ACT-11 | B2.F2 | FR-05/09 |
| ACT-12 | B2.F2、B5.F | FR-05/09/12 |
| ACT-13 | B2.F2、C1.F2 | FR-05/06/10 |
| ACT-14 | B2.F1/F2、B4.F | FR-02/05/07 |
| ACT-15 | B2.F2/F3 | FR-07/08/09 |
| ACT-16 | B2.F2/F3、B4.F | FR-05/07/09 |
| ACT-17 | B2.F1/F2 | FR-05/09 |
| ACT-18 | B2.F3、B4.F | FR-07/11 |
| ACT-19 | B2.F3、R0-02、C6 | FR-07/08/09 |
| ACT-20 | B2.F2/F3、C5 | FR-07/09/11 |
| UI-01 | C2、B4.F | FR-11/13 |
| UI-02 | C2/C3 | FR-11/13 |
| UI-03 | C2/C3 | FR-11/13 |
| UI-04 | C3、B4.F | FR-10/11 |
| UI-05 | C2、B2.F1 | FR-01/13 |
| UI-06 | C2/C3/C5 | FR-11/15 |
| UI-07 | C2/C5 | FR-11/15 |
| UI-08 | C1/C2/C5 | FR-11/15 |
| UI-09 | C2/C5 | FR-11/15 |
| UI-10 | C1/C5 | FR-10/14/15 |
| UI-11 | B4.F、C2、F3 | FR-07/11/12 |
| UI-12 | C2/C5、R0-04、F3 | FR-11/15 |
| UI-13 | B4.F/B5.F、C5、F3 | FR-11/12/15 |
| UI-14 | C2/C5、F3 | FR-11/15 |
| UI-15 | C2/C3、B4.F | FR-11/13 |
| UI-16 | C4/C5、R0-05、G1兼容 | FR-03/11/15 |
| UI-17 | C4、B3.F、B5.F | FR-04/11/12/15 |
| SYS-01 | B4.F/B5.F、B2.F2 | FR-05/07/12 |
| SYS-02 | B4.F/B5.F | FR-07/12 |
| SYS-03 | B5.F、B3.F | FR-04/12/15 |
| SYS-04 | F1、B4.F/B5.F、C1/C4 | FR-07/11/14 |
| SYS-05 | B2.F1/F2/F3、F1 | FR-05/07/14 |
| SYS-06 | F3、B1.F、C2/C4 | FR-04/11/12/15 |
| SYS-07 | B1.F、B2.F2、B5.F、F3 | FR-09/12/15 |
| SYS-08 | B1.F/B2.F1、C6、R0-06 | FR-01/02/03/05/15 |

表中B2.F1/F2/F3分别指同一B2任务的原Free切片，绝不是性能F1或同步F2；C2/C3等为协同原任务。MAP15 + INV9 + SEC12 + ACT20 + UI17 + SYS8 = 81。附件中16项A01–A16是设计问题登记，不与工程A/R0任务混淆，其责任映射见唯一计划§9.1。

## 4. 完整旅程、独立oracle和反自证

J1空缓存：真实本地固定认证读取/解析→当前context→两个同名P（一个初始仅按钮）→普通NONE/UNKNOWN→原生P/C→唯一四格返回，目标/来路/分母全部正确。

J2活动：旧C失败发送→成功ACK无原始time→跨校准due及worker重启→持久provisional锚保持原起点→后来原始time复验不重复；共享他人/旧branch反例保留。

J3界面：工作区与连续侧栏同时运行→原生model/files/权限→input/contenteditable草稿→Back/Forward→200%→历史旧项→片段→原生搜索；批准v2.7外观与行为完整。

J4恢复：多tab账户/context切换→native/evidence提交间退出→schema准备/恢复→实际disable/uninstall→ChatGPT原生继续，逐阶段检查privateProjection/nativeOperable/人工资产。

四个旅程引用已有ID，不增加测试数；不得以不相关单元PASS拼成从未执行的端到端成功。原SyntheticHostAdapter与生产adapter共享行为合同，但生产结果必须实际来自native-shaped页面和固定本地认证服务，不能读hf seed或由TestScopeProvider直接返回全量verified答案。

fixture来源四族、支持与故障profile、预期world、暴露字段、hash在实现前固定。oracle不能调用生产parser生成期望。必须能检测删除origin检查、missing改NONE、name合并、旧epoch放行、伪receipt认证、ACK前记发送、current leaf作事件键、重复续锚、auto Popover、焦点穿透、异步双导航和非原子continuation等设计变异；检测不到应修test/oracle，不宣布实现正确。

真实S要求独立Chrome Profile、本地fixture origin、外网阻断覆盖extension worker、真实content/UI frame/worker/IDB/浏览器导航与管理动作。不得修改日常Mac代理/DNS/根证书或进入真实ChatGPT研发；unpacked被管理策略拒绝时记NOT_RUN，不绕过。自然worker休眠与DevTools强制terminate区分，adapter.stop不能代替disable/uninstall。

## 5. 量化质量、性能与报告

在限定可验证样本中记录应暴露P/C数量、正确映射/可达数、错误P归属、NONE/UNKNOWN误标、原名不一致、确认近期误下沉/旧项滞留、provisional纠正延迟、undated数量和具体来源缺口。正常支持集对象/成员/目标准确及可达目标为100%，未知未加载对象不虚增分母。任意跨scope曝光、原生功能丢失、误目标、人工资产损坏为失败，不能平均准确率稀释。

provisional不混入confirmed计算100%原始时间准确。合格新证据到达后1秒内更新的原目标保留，另报用户发送→合格ACK/时间证据到达和远端→桌面native可见延迟。前台首轮30秒内结束或明确降级；6秒RPC用elapsed deadline保持，不以重试/延长timeout掩盖失败。导航p95<150ms、搜索首屏<300ms及原F1规模/弱设备目标不变，单次样本/renderer4x不代表全部设备或worker降速。

workspace/sidebar共享索引、现有目录/staged HEADER、同scope foreground优先与新读字节验证必须保持；冷加载和mixed/multitab/100k4x未达标仍在原F1，不在本次文档中宣布关闭，也不无限阻止生产首个闭环。

报告至少含specRevision、sourceCommit、dirtyPatchHash、build/fixture/oracle hash、Chrome/OS、networkPolicy、实际provider/profile、正向分母/正确数、动作重复数、每个case/subcase优先级/结果、证据等级和limitations。不得记录真实ID/token/完整正文/草稿；历史记录和当前运行分开，源码变化不能沿用旧包hash。

找回改善30%、周纠错≤2分钟及至少一轮实际日常/跨日恢复旅程保留为C6/F4待验证目标，不能由81项绿或文档采用推出用户收益。

## 6. 固定G/U退出与分级结论

最终仅执行主规格§11的定向清单，不重新开展全面产品研究：principal主备读取及A/B切换；个人/组织/context同URL与多tab关联；同名/IDless→exact及改名；普通/P/customGPT/共享的NONE语义；本人ACK/失败/重开/编辑/branch/time精度；真实60天旧样本和另一原生客户端一次活动自然再发现；实际CSP、原生功能与v2.7、PAIA、物理IME。

真实账号/原生创建/发送/移动按AUTHORITY分别授权，使用任务级总预算，不换目录/Profile重置。没有实际条件逐项NOT_RUN；只读失败不扩大到认证材料抓取或全历史隐藏接口。G不通过只定向修对应provider/parser/mount和回归，不再生成第三套架构；核心能力无法满足则相应完整profile不得发布，原生访问和人工资产保持。

IMPLEMENTED_SYNTHETIC仅表示对应L/D/S成立；Host完整离线候选要求81适用子场景/J1–J4、P0/P1无未解决FAIL、原回归和支持闭包成立。LIVE_VERIFIED只认证实际指定G路径。FREE-ACCEPTED要求FR-01–15完整适用矩阵及核心真实来源/活动/原生/跨端条件成立；RELEASE-READY另加F3/F4；PUBLISHED仅由另行批准的实际发布证明。本次正式文档采用不产生上述任何新运行状态。

## 7. Pro未来7组验收完整保留

| ID | 保留目标 | 依赖与证据 |
|---|---|---|
| PR-01 | 确认NONE窗口自动虚拟归组；UNKNOWN不误分，未归类仍可达 | FREE-ACCEPTED/B3.P/D2；L/D/S+G/U |
| PR-02 | AI虚拟组名/派生标题不改变原生标题/P；回Free即原名 | D1/D2、B3.P；独立自然样本+S/G |
| PR-03 | 升降级/重升级/多scope/撤权时人工资产/别名/锁/备份不丢 | B4.P/B5.P；D/S/G |
| PR-04 | 否定/同名/多主题/误分类、人工纠错/锁/排除和安全undo | D1/D2；L/D/S/U |
| PR-05 | 自然中文gold、模型成本/权限、precision/coverage/区间、质量不足不自动应用 | D1–D5；U与实际供应商证据，模板不能替代 |
| PR-06 | Series/拆合/redirect/显式跨Project语义投影，不改变原生模型上下文与成员 | B3.P/C.P/D2；S/G/U，旧N28/T28高阶项保留 |
| PR-07 | AI/会员失败、断网、预算不足时Free完整可用，原生数据和Pro资产保留，原生写权不自动开放 | C/F/E边界；L/D/S/G |

Pro不在本次Host并行实施范围；E原生代理、F2/G高级能力和计费维持原独立许可与验收，不能用会员支付或模型调用成功替代安全条件。
