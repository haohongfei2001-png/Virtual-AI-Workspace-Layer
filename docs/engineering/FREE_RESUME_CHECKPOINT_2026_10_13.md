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

## 第五轮恢复增量（接1210407）

前一节的runtime提交后全量read缺口已完成：服务invalidation模式零fullread，独立snapshot模式不改；多TTL和冷启动已读缓存调度、无source纯显示过期均补齐。315条完整Node后timer接收者最终修复23条针对性、MV3 9/9、可见性167.1ms、真IDB 10k/100k两组通过，证据边界见STATUS第五轮，不相加。

当前可继续的性能条件：100k原生+活动单ref双提交仍1340.2ms，主要根manifest校验/写入成本；已消除fullread不是全端到端达标。10k121.9ms。不要重写已通过通知/生命周期/资产旅程；下一轮直接定位剩余manifest成本和完整UI链路，不重新规划。外部真实账户/PAIA/物理IME/弱设备及日常验收条件不变。

最新包 `/private/tmp/vaiwl-free-delivery-invalidation-20261013/vaiwl-free-synthetic-only.zip`；SHA256 9fc158e8cba4ada662ec825cb671347d5e8b9fa045769c848f78d82fa77e0a65。当前HEAD用git核对；7ac2e28、25e2ab2、1210407及本检查点尚未正常同步到远端b2a262b。未强推/更换remote/部署；网络恢复后正常快进推送原分支。完整Free尚未交付。

## 第六轮恢复增量（接03ef76a）

Git连接恢复，03ef76a已正常推送原分支；本轮末再同步新检查点，实际远端用git/PR API核对。已修导航按压点击丢失、同binding用户工作区/历史校准缺失、100k分页跨lease及0页续租同版本跨账号风险，另去掉重复root/recovery hash。最终Node321/0、MV3 9/9、交互6、续租2，证据边界见STATUS第六轮。

下一可执行：修正后的calibration-ui-scale-browser支持加载后才触发真实source更新，10k已327.1ms通过；100k完整增量尚未执行。100k首次加载约21.3秒诊断、registry双提交1177.5ms仍需优化，不能以提高请求/lease边界掩盖问题。5000条页遇很长别名的16Mi边界可考虑有界拆页，不删数据或放宽记录限制。已测模块不要重写。外部真实账户/PAIA/物理环境条件保持未授权，仍不能验收完整Free。

本轮新合成包 `/private/tmp/vaiwl-free-delivery-round6-20261013/vaiwl-free-synthetic-only.zip`，SHA256 d5f2a3d3c01ac2d43fcee1c9d0ed3e22d7aacea9b4cd126e0894f5be5863fbe4。HEAD用git核对；持续沿当前分支及Draft PR #16，未merge/部署/付费。

第六轮最终同步结果：本地实现bf9bcd4。GitHub API确认PR #16仍Draft、远端03ef76a；默认HTTPS推送报HTTP/2 framing error，一次命令级HTTP/1.1补救20秒超时后停止重试。没有改remote/config；bf9bcd4及本同步记录仅在本地，不能把PR远端描述成已含第六轮代码。

## 第七轮恢复增量（接fe046ab）

100k完整增量已执行，不再NOT_RUN：baseline3513.7ms，严格字节验证缓存后2149.9ms，均功能PASS而1秒性能FAIL。初始22188.5→17525.8ms。分片checksum与schema缓存只在每次完整字节、checksum、scope/key全部相等时复用，旧checkpoint在同事务闭包复用；自定义toJSON/iterator绕过已堵。超大页二分/单项终止/预算也已实现，勿重复实现。最终Node360/0，其他源hash与真实性范围见STATUS第七轮。

下一可执行性能位置：共享WorkspaceRepository.registerNativeReferences/partitioned root验证、freeHeader重复100k映射及CHECK中共享manifest验证；saveView自身只写b23_views小记录，不应假定它单独重写整个manifest，其观测延迟可能是并行JS/事务排队。不能省略scope、marker、checksum/CAS或最终版本校验。现有100k完整UI脚本能固定源码做前后测，无需重建环境/计划。

最新包 `/private/tmp/vaiwl-free-delivery-round7-20261013/vaiwl-free-synthetic-only.zip`，SHA256 f84712d88cfdc9a2c2817370f0eb43f6632c650aff941bd68a725d58e4d0ce9c。本轮唯一20秒正常推送超时后停止；远端上一确认03ef76a，当前实现及检查点仍本地待同步。真实账户/PAIA/物理环境条件保持未授权且阻塞对应验收；整个Free尚未交付，继续本地可执行优化。

## 第八轮恢复增量（接98d6e17）

共享manifest严格缓存及HEADER元数据/PAGE同事务上下文已经完成，不需重写。Node366/0和新增context4/4分别记录；真实MV3 9/9；固定55源hash100k初始12913.5ms、完整更新1625.2ms，功能PASS/1秒性能FAIL。包及hash见STATUS第八轮。当前真实账户等权限条件保持不变，完整Free未验收。

下一可执行：client已执行freeNavigationSnapshot后navigation.update再次转换100k引用；消除该重复转换并验证原名/历史/原生节点和安全更新门控，继续保留scope与末次CHECK。当前分支不变，无额外工作树。最新head以git核对，远端上一确认03ef76a，正常同步待网络可用。

## 第九轮恢复增量（接1a0dcaf）

单次prepared导航转换（包含按压延迟队列）及逐项证明的路由索引复用完成。Node387/0（末次队列标记修复前），最终prepared browser9、MV3 9/9分别记录；100k固定源码功能PASS、1790.6ms，较上轮1625.2ms慢，不能宣称整体提速或达1秒。源码/实际耗时/包hash均见STATUS第九轮及独立free-round9-*文件。

可继续本地定位：native.apply526ms、evidence.apply179ms，内部saveNativePieces/ saveEvidencePieces分别先JSON.stringify(manifest)限额再stable编码hash。合并编码时必须保留原结构、128Mi聚合、16Mi单记录/CAS、scope/末次CHECK，不接受外部预先算好的可信size。不要重写已测的分页/缓存/导航。

1a0dcaf后的实现和检查点仍在当前正式目录/分支；唯一20秒普通推送超时后停止，GitHub API确认远端03ef76a Draft。网络恢复后正常push原分支，不换目录/远端、不强推。当前完整Free不合格；对应真实来源/账户/PAIA/物理设备验收仍缺原有授权条件。

## 第十轮恢复增量（接838fb6d）

内部原生/活动manifest单次规范编码用于size+checksum已完成。最终Node394/0、实际10k IDB功能与MV3 9/9通过；包/源码/报告见STATUS第十轮。普通100k性能认证未重跑。一次100k CPU采样表明verified-record-cache.strictJSON为最大self热点375.8ms/22.5%，活动根处理156.8ms；UI适配仅12.3ms。1590ms为带profiler收尾的诊断，不替换第九轮普通1790.6ms/1秒FAIL结果。

下一独立Free工作：优化严格序列化的逐key编码开销，必须逐次核对完整字节、checksum、scope/key并拒绝toJSON/iterator碰撞；不能换成revision/checksum-only。旧cache反例16项及shared6项已存在，避免重写功能。运行时冻结源已验证；最后head以git核对。远端PR16上一确认仍03ef76a Draft，后续本地提交待网络恢复后普通push。完整Free及真实来源/PAIA/物理/真人验收仍未完成。

## 第十一轮恢复增量（接224724e）

严格JSON完整内容缓存编码已去掉大map/join临时数组，NumberToString等价；不缓存可变facts、不跳checksum/scope/key。完整Node419/0，后补budget边界的44新+16旧合同合跑60/60；MV3 9/9；普通固定源码100k更新1635.9ms、初始15762.7ms，功能PASS/1秒FAIL。最新包/hash与source receipts见STATUS第十一轮，勿把profile1590当普通baseline。

下一本地位置：FreeEvidenceRepository.query在header分支仍Object.keys全量refVersions且计算外层header丢弃的total/nextOffset；可以专用元数据读取，但保留marker与完整root校验。更大的根manifest/版本表O(N)仍是实际瓶颈，须按具体代码而不是继续改DOM。头/页/双CHECK安全栅栏不削弱。最后head用git核对；当前正式分支和目录不变，PR16远端03ef76a仍Draft，后续本地待普通同步。真实外部验收条件不变；Goal未完成。

## 第十二轮恢复增量（接10aa13f）

活动header专用metadata读取已完成，完整root+marker+末次guard仍保留；相关组合93/0、新合同10已包含，MV3 9/9、10k IDB功能PASS。未重复100k，上一1635.9ms性能FAIL仍有效。包和源码来源见STATUS第十二轮。

网络恢复：03ef76a至10aa13f已通过原origin普通快进推送，GitHub API确认PR16 Draft。当前增量提交随后同步，实时HEAD用git/PR核对；不要再沿用此前网络阻塞结论。下一局部成本为显式ids分页仍创建100k键数组只求total；任何计数复用须绑定已核验完整内容，不能绕过root/checksum/marker或末次CHECK。核心结构/真实ChatGPT/跨端/PAIA/物理与真人验收界限不变，完整Goal仍未完成。

## 第十三轮恢复增量（接182e96b）

显式ID页计数已在严格完整内容编码中取得，无额外全量键数组、无计数缓存。原校验错误优先级已修复并有反例。最终Node462/0、MV3 9/9、10k真IDB通过；普通固定源码100k1377.8ms仍1秒FAIL，首屏20577.5ms更慢。包及各自source receipts见STATUS第十三轮。

下一执行活动manifest重复枚举合并：checkEvidenceManifestStructure对refVersions/sizes重复8次以上keys/entries/values，可保留各表keys数组并累计size，保持原错误优先级/同键集合/100k/128Mi限制。代理只写独立测试，root负责源码。182e96b已正常同步PR16 Draft，本轮实现随后普通提交推送；无新工作树/部署。真实Free未验收，继续可执行本地工作。

## 第十四轮恢复增量（接5f18bc1）

活动manifest重复枚举已合并，59条原约束/错误顺序基线，最终相关110/0和10k真IDB通过；独立审查通过。没有重跑完整Node/MV3/100k。包与hash见STATUS及free-round14-*。5f18bc1已正常推送PR16，本节提交继续普通同步。

直接继续共享partitioned.saveMutation新根size/stable重复编码和旧检查点重复hash问题；仅内部可信事务路径可复用，缺envelope时保留原恢复回退。不要削弱checksum/CAS/marker/guard或丢Pro人工资产。当前性能仍100k1377.8ms/1秒FAIL，真实Free验收仍未完成。

## 第十五轮恢复增量（接38726aa）

共享分片新根单次有界规范编码已完成，公共校验/协作yield未削弱；旧根checkpoint哈希保持原样，未引入不安全复用。F1/shared57/0，后补新合同19/19，真实IDB分片20/20。Node微测仅诊断，不替换普通100k1377.8ms未达1秒结论。新包/hash见STATUS第十五轮，沿原PR16正常推送。

下一依赖已满足本地工作：原生manifest验证重复枚举仍在100k更新关键路径，审查并消除重复遍历但保留scope/checksum/marker、units/CAS/完整恢复和最终版本栅栏。当前工作区/分支不变；真实账户及其余外部验收条件仍阻塞对应路径，完整Goal未达成。

## 第十六轮恢复增量（接4822a0f）

原生manifest map类型漏洞已修，枚举合并；native-partition-capacity现在进入明确手动恢复。92项Node和真实headless恢复7/7通过，包含重签refs=true、来源撤销/草稿/不发送。旧性能100k1377.8ms仍未达1秒。包及证据见STATUS本轮。

4822a0f push网络超时；已独立继续本轮并用短请求确认GitHub恢复，最终两提交普通push后核对。下一本地工作应合并近期原生/活动验证优化做一次100k更新关键路径测量，基于实测确定剩余热点，避免无证据改DOM。所有真实外部验收条件仍有效，完整Goal未达成。

## 第十七轮恢复增量（接87fa2ff）

Project增量双向依赖修复及Free PAGE最终16Mi UTF8/有界拆页完成，完整Node582/0、MV3 9/9、真实页面Project恢复通过。HEADER真实MV340.4MB/941ms通过，未复现传输失败；勿凭“超过16Mi”臆造Chrome通道上限。各报告独立source/buildhash，不合并旧成绩。

本轮代码前100k1178.1ms仍未达1秒；下一可执行为fixtureObserve当前workspaces.read+native.read全量，应用workspaceContext单ref及native.page，保持本地严格发送/重复事件/授权/来源/CAS。源review代理只读，无未提交源码。包和准确状态见STATUS第十七轮；真实Free未验收，继续原分支PR16。

## 第十八轮恢复增量（接dab61e7）

确认发送已去除两种全量读取，旧预加载事件冲突跳过漏洞已修。最终相关Node30/0、MV3 9/9、真实10k和容量内99,998→100,000发送三旅程通过；最大规模1.85–2.28s仍未达1秒。首次夹具来源缺失与超容量失败未伪装成通过；修正只在测试数据，细节/最终证据/包hash见STATUS本轮。

下一可直接执行：client Free两次CHECK合并为统一发布前最终一次；保留构建前renewReadBinding、异步generation/URL/visibility guard、最终身份/scope/native/workspace/evidence版本验证。candidate只在检查成功后赋freeReplica/freeIndex/data/navigation；零页复用/空库同样检查，Pro不改。代理只读证明已给出，尚未改此处代码。真实外部验收条件与目标不变，完整Free未交付。

## 第十九轮恢复增量（接ee7bc03）

Free界面改为构建前续租、构建后统一一次最终CHECK；候选未验证不发布，Pro不变。真实headless屏障7/7、MV3 9/9、100k三发送功能通过但1824.9/2083.0/2046.8ms均超过1秒。证据free-round19-*，不重复完整Node；包路径/private/tmp/vaiwl-free-delivery-round19-20261013/vaiwl-free-synthetic-only.zip，hash见STATUS。

ee7bc03正常push连接443超时，最后确认远端dab61e7 Draft，后续本地提交须正常同步，不冒称已推送。下一可执行：共享partitioned.saveMutation旧root再次hash，改同事务验证后立即写checkpoint，防止后续impure reducer改变旧记录；新root完整验证/编码、回滚/CAS/恢复保持。另发现只有删除的Free manifest可能被zero-page分支复用旧snapshot，当前native不会物理删除，记录为客户端协议边界待修，不宣称生产可达。真实Free未完成，外部条件保持。

## 第二十轮恢复增量（接c81d84f）

旧checkpoint无需再次hash：验证后同事务立即put原记录，IDB同步克隆和abort防污染；原生引用注册仅新增才写，恢复保留恢复后checkpoint。分组Node60、96、新10分别通过；真IDB20+2独立通过；100k发送1724.4/2045.6/2046.8ms均功能PASS但1秒FAIL，证据free-round20-*。包/private/tmp/vaiwl-free-delivery-round20-20261013/vaiwl-free-synthetic-only.zip，hash见STATUS。

下一立即修复：真实restore→undo备份新增引用引发manifest仅删除，plan需rebuild，保持暖/冷投影一致。tests/free/replica-removal.test.mjs为待集成新反例，不属于本轮已通过数。当前GitHub短连接超时，远端最后确认dab61e7，本地ee7bc03及后续待正常推送；不改remote/force/merge/deploy，Free未完成。

## 第二十一轮恢复增量（接38705b8）

真实restore→undo暖缓存残留已修复；plan计数含omitted删除，等量替换仍拉新页，简化prior有fallback。最终完整Node610/0/0skip、最后源码真实UI1/1；原失败及修复来源见STATUS和free-round21-removal-ui。最终包/private/tmp/vaiwl-free-delivery-round21-20261013/vaiwl-free-synthetic-only.zip。

下一独立任务：用现有100k send脚本可选诊断计时，拆workspace.partialContext/ingest、evidence.page/apply、native.page/apply和后续HEADER成本，先证明冷新root的重复编码开销再改缓存。Round20仍1.72–2.05s/1秒FAIL；不能宣称Free完成。远端最后确认dab61e7，后续本地提交待网络恢复后正常推送原origin，不重复部署或改变远端。

第二十一轮诊断已完成并保存：见free-round21-send-profile.json/.existing.cpuprofile及stack-analysis.json，CPU主要严格JSON290.8ms和sha256242.2ms，发送内部native.apply453.7ms/evidence.apply255.7ms/shared.ingest171.5ms。未修改运行时代码，包仍第二十一轮。下一试验为安全ASCII JSON字符串快捷编码的独立交替基准；无收益则不改。空validator缓存预热尚不可采用：可变getter可能让checksum与缓存看到不同值；必须保持全部字节/schema/marker/CAS约束。

## 第二十二轮恢复增量（接b4958d6）

采用已测Chrome有效的SHA直接状态赋值两处改动，格式/算法/所有校验不变。完整Node650/0/0skip、MV3 9/9、100k功能3/3；1642.6/2030.9/1980.3ms仍1秒FAIL。ASCII字符串快捷编码、rotate内联无收益已放弃，不要重复尝试。证据free-round22-*，包/private/tmp/vaiwl-free-delivery-round22-20261013/vaiwl-free-synthetic-only.zip，SHA256 cc79ab39958c132420a2bb3578b8d5d7281086752275102b82d7e169cd801286。

下一接既有profile：主要native.apply/evidence.apply/shared.ingest及HEADER新根冷校验成本，不再重写已测UI或做无依据微优化。可评估原生GC旧checkpoint验证的多版本缓存，但每次仍须完整字节/checksum/scope/schema匹配、保留8Mi预算和marker；尚未实施。空verifier预热可变对象方案仍不安全，禁止直接采用。真实来源/账户/PAIA/物理与F4条件未解除；Free未完成。当前GitHEAD用git核对，远端最后确认dab61e7，正常同步不改变分支/remote。

第二十二轮同步完成：实现be1289fff333f1465624a009ce6d1561d0ab42af已正常快进push，GitHub API核对PR #16仍Draft且head一致；先前“待同步”是当时历史，不再代表这些实现提交。PR正文已更新，后续状态记录提交不改变运行时。续接仍沿原目录/分支；下一性能位置及未满足真实条件见上节，完整Free未完成。

## 第二十三轮恢复增量（接c2f92e0）

原生3版本严格缓存及恢复后GC孤儿修复已完成。完整Node658/0/0skip、真IDB恢复GC1/1、100k功能3/3通过，1546.2/1896.8/1812.3ms仍1秒FAIL。证据free-round23-*；包/private/tmp/vaiwl-free-delivery-round23-20261013/vaiwl-free-synthetic-only.zip，hash见STATUS。下一立即修复pendingSynthetic仅pathname的同URL换scope误归属风险，owner BOUND增加已核验scope、事件捕获原scope/document并比较，不可追认无scope旧事件；安全前提满足后再减少新聊天多余快照。Git已正常同步至c2f92e0，后续提交按正常push。所有真实外部条件未解除，Free未完成。

## 第二十四轮恢复增量（接531c146）

pendingSynthetic已绑定捕获时验证过的scope/document/route/有效期；BOUND输出scope，最终CHECK交叉核验，冷无来源/隐藏/expired不追认。完整Node658/0、补强broker13、实际归属browser7/7、MV3 9/9。固定包/private/tmp/vaiwl-free-delivery-round24-20261013/extension及zip，hash见STATUS。未重跑100k，不改变1秒FAIL。

下一实现known-anchor-contract.mjs当前失败：恢复撤销后B1仍有锚但Free导航缺UNKNOWN入口。先修未来RESTORE_BACKUP undo保留必要身份并撤销人工作品（保留冲突检查与真实inverse日志），历史B1-only用有界迁移补录，绝不从旧锚重放授权/标题真值。旧removal UI测试以前只证明owner/client一致，不能作为已知引用可达性的产品正确性证据；历史报告保持原样，新增证据分开。531c146 push45秒超时且短只读连接仍8秒超时，最后远端c2f92e0；勿循环重试，继续本地。

## 第二十五轮恢复增量（接05292d0）

未来RESTORE_BACKUP undo不再删除必要refs身份，人工其他patch正常逆转且全部冲突检查保留。新合同4/4、完整Node663/0、真IDB界面1/1；UNKNOWN占位可达且不显示备份标题，草稿/阅读保持。包和报告free-round25-*，hash见STATUS。下一立即做历史B1-only有界补录：同tx refs游标+registerNativeReferences+durable marker，B1新增/共享恢复同tx失效marker；不每次HEADER全量list，不恢复原生事实或授权，缺根有history/checkpoint拒绝。正常远端同步仍待GitHub恢复，最后确认c2f92e0，已本地保存531c146/8e4bc86/05292d0。Free未完成。

## 第二十六轮恢复增量（接3cec904）

历史B1锚补录API/后台、游标原子性、B1新增及共享恢复失效、legacy容量自动分片已实现。完整Node693/0，真IDB API7、service3、20k+1容量1、MV3 9独立PASS，详见STATUS来源限制；打包已补两套新模块依赖。100k三功能PASS但2322.9/3101.8/2462ms退步且1秒FAIL，不能隐藏后台扫描成本。

下一两项确定工作：1）done及partial marker增加共享ref-ID集合摘要+B1 scoped count以检测旧包回退writer不失效游标；旧undo/new B1合法链已查明，独立失败合同正在准备；2）新发送优先，后台补录需可取消单批/安静期再续，当前readwrite扫描阻塞SEND/HEADER。保持最终CHECK、全部字节验证和本地真实测量，不改harness等待掩盖。包/private/tmp/vaiwl-free-delivery-round26-20261013/extension，hash见STATUS。远端最后确认c2f92e0、网络未恢复，后续本地提交待正常推送。完整Free仍未完成。

## 第二十七轮恢复增量（接160d7b7）

旧writer4项遗漏用真实历史模块复现后修复：marker ID摘要+B1count覆盖done/partial与旧4字段迁移。前台请求中止独立补录事务、quiet1秒续作、不撤binding。完整Node703/0，真IDB service4/4含同lease CHECK heldtransaction取消；100k1758.2/2212.2/1997.7ms均功能PASS但1秒FAIL。包/private/tmp/vaiwl-free-delivery-round27-20261013/extension，hash及证据见STATUS。Git正常同步至160d7b7且PR16 Draft API已核对，下一提交需正常push。

下一按已捕获scope/document来源实现新聊天安全前置至首次快照之前，限1项、同串行队列内直接函数避免嵌套queue死锁，只有已核验同scope库存初始化才能采用；冷无scope不能追认，最终CHECK与失败恢复保持。此路径尚NOT_IMPLEMENTED。子代理validation遭额度限制，主代理仍完成上述实测，下一轮直接接当前状态，禁止重建计划/目录。真实Free未验收。

## 第二十八轮（接565178f）

已完成暖态重绑前至多1观察、冷态保守读取、末次CHECK不变；Free/人工恢复清空旧观察与副本。Node703/0、来源/恢复10/10、MV3 9/9。100k正常1611.2/1729.7/1729.1ms均1秒FAIL，各报告free-round28-*，不与旧结果相加。包 `/private/tmp/vaiwl-free-delivery-round28-20261013/vaiwl-free-synthetic-only.zip` SHA2560791b4768a002688704e388e7c4105c2058580843adb1519f653d508f65e1c73。下一工作集索引优化已有独立测试准备，继续当前目录/分支/PR16。真实源/PAIA/物理验收条件保持，完整产品尚未完成。

## 第二十九轮：工作集复用当前scope ID索引

从5120109继续，当前索引增加精确byId查询，工作集渲染替代逐项全量find。复用当前快照既有Map，未增第二套缓存；人工顺序、缺失项占位与原生路由first-match规则保留。独立3项Node覆盖重复URL不同ID、新标题/UNKNOWN、两种rebind与跨scope隔离。相关Node组合48/48；真实headless DOM100k引用/1000工作集的7项功能检查通过，重复find比较99,501,499→0。带计数诊断render 490.5→13.1ms，不冒充正常延迟认证或发送达标。

完整Node/MV3/100k发送本轮NOT_RUN，上一轮各自证据与发送1秒FAIL保留。包SHA256 `84f20612d831f44c469c49ed1000c763d39907899be405fe54272a32a398ed72`，仍SYNTHETIC_ONLY。已同步上一轮5120109到原远端，当前新HEAD以Git为准。下一独立热点是零页、只偏好或view更新时仍全量适配Free引用，须由私有prepared来源与严格plan条件证明复用，不省略末次CHECK。真实Free和发布仍未完成。

## 第三十轮：零页展示结构复用与发布边界

从3e88682继续。free-view私有凭据同时绑定scope和原始assembled快照；rebind只在客户端已证明零差异plan时调用，拒绝scope/session/评估时刻/来源/成员见证/库存变化及header结构字段。偏好、view及版本元数据更新保留旧refs/groups等展示结构，末次CHECK和通用current/lease/scope/expiry验证后才保存候选。恢复、账号路由及退出同步清理prepared；文档重绑首次重新适配原base，后续可复用。拒绝旧revision移至缓存更新之前。

最终完整Node724/0/0skip（含18新rebind、3上轮工作集合同）。实际headless/IDB发布屏障10/10，含零页偏好生效、跨scope拒绝、document首次ADAPT后下一次0ADAPT；使用明确的测试调度钩子/部分transport注入，不冒充生产权限。观察来源/恢复小owner10/10及真实MV39/9分别通过。100k发送本轮NOT_RUN，第二十八轮1611.2/1729.7/1729.1ms及1秒FAIL保留。

包 `/private/tmp/vaiwl-free-delivery-round30-20261013/vaiwl-free-synthetic-only.zip`，SHA256 `9ad78c47ba875d38f7d67ea59cce93daa0d8d77d3f401bb5445bb94e4a393a5b`。仍SYNTHETIC_ONLY/NOT_RELEASE_READY；真实账户/来源、PAIA、物理弱设备/IME及真人日常验收仍缺对应条件。继续正式计划，不能把展示优化或合成包算完整Free交付。

## 第三十一轮：共享根验证回到原生写事务

从0ab58f0继续。native.apply不再预读shared manifest/full legacy；registerNativeReferences同tx验证后，只有Native opt-in且legacy refs+batch>15000才要求中止、调用现有迁移并最多重试一次原请求。保留原expectedRevision/fingerprint；后台B1补录仍走旧20k路径。缺根在同tx查checkpoint/history，有旧人工作品证据拒绝空库重建；损坏根、撤权、CAS及失败不迁移循环。已提交receipt的重放可返回历史结果，不是共享根健康或新写许可。

最终完整Node733/0/0skip，含9项新合同。实际headless IDB原生15000→15001迁移1次，首native事务无残留，Pro/工作集/其他scope/幂等保持；损坏共享根精确corrupt-record拒绝且native stores不变。测试初次scopeKey写错及旧sourceRevision提前拒绝已修正后重跑，不用错误拒绝冒充checksum覆盖。原后台20000→20001容量迁移另通过，证明opt-in未改旧路径；MV3 9/9通过。

正常无采样100k三发送功能3/3、源码hash稳定，2138.3/2161.2/1945.2ms均1秒FAIL，比Round28更慢，不能声称端到端提速。每次1发送/event/hint，fullread0，阅读/草稿保持。下一可执行检查：foreground优先目前从请求开始设1秒安静期，长RPC结束前后台可能恢复；需按实际请求生命周期维持暂停，不人为延后测试起点。

包 `/private/tmp/vaiwl-free-delivery-round31-20261013/vaiwl-free-synthetic-only.zip` SHA256 `cf68596a32a092d3a7bd1e89f3f1deb631c9fdf2d4d90a12259a67ea002cf535`，仍SYNTHETIC_ONLY。Git正常推送0ab58f0报HTTP2 framing，一次命令级HTTP1.1补救45秒超时后停止；最后API确认Draft PR16 head3e88682。未改remote/config、未force/merge/deploy。真实源/账户、PAIA、物理及真人条件仍缺，完整Free未交付。

## 第三十二轮：后台暂停覆盖完整前台请求

从d182aeb继续。新增beginForeground幂等release与活动计数；broker CHECK/HEADER/PAGE/SEND/UPSERT以finally释放，成功、错误、权限失效均覆盖。所有活动RPC结束后才开始1秒quiet，期间不启动后台或轮询timer；stop/rebind旧release不影响新绑定，终态degraded/partial不会自动循环。旧瞬时prioritize接口保持。

最终完整Node753/0/0skip，含7项runtime与13项broker生命周期反例。真headless/IDB客户端4/4：持有后台真实事务，前台使其abort；前台CHECK挂起1250ms仍无后台重启，释放后补录并保持Pro、草稿、阅读；账号切换仍取消旧scope。MV3 9/9。正常100k功能3/3、hash稳定，1772.9/2107.1/1966.8ms仍1秒FAIL；fullread0、各1事件/hint/消息，未在测量前等待后台静止。

包 `/private/tmp/vaiwl-free-delivery-round32-20261013/vaiwl-free-synthetic-only.zip` SHA256 `e0b9d556a884d73d862bcc2613d23f45b98ae087e03ccab2586372e5b4504a1b`。只读API再次确认Draft PR16 head3e88682；未重复推送失败端点，后续本地提交尚未同步。剩余本地F1热点：HEADER独立只读等待及页面组装/索引协作调度，先证据判断再改，不减少安全校验。真实账户/来源/PAIA/物理/真人条件保持，完整Free未完成。

## 第三十三轮：HEADER独立只读重叠

从0e80492继续。保持ensureNative顺序完成（bootstrap可能写共享锚），之后workspaceContext和evidence.header用allSettled并行；按原调用顺序抛首个失败，两项均结束才返回，不残留未结束的只读任务。每仓库的checksum/scope/guard与最终版本/权限栅栏不变，不声称跨仓库原子快照。

独立6项新合同含同时启动、单/双失败等待、固定错误顺序、换scope拒绝和cold bootstrap先持久；相关Node20/20。实际发布屏障10/10、MV39/9。正常100k功能3/3、hash稳定，1640.5/1700.3/1613.0ms均仍1秒FAIL；无fullread/重复发送/草稿损失，较Round32低但单次数据不作统计结论。本轮完整NodeNOT_RUN，最新全套仍是Round32的753/0。

协作调度独立诊断：按4ms合并task的内存候选未显示构建收益（原155.2/151.3ms，对照153.0/161.2ms），重绑仅约1ms差；因此cooperate源码保持原样。该报告只属计算诊断，不是产品性能认证。包 `/private/tmp/vaiwl-free-delivery-round33-20261013/vaiwl-free-synthetic-only.zip` SHA256 `021b5b8d8fbf66625373ecaa5c104b9dc8880741053285e8b89606c7f47076f7`，仍SYNTHETIC_ONLY。

接续位置：100k单次新聊天写链与HEADER/PAGE/CHECK仍超1秒；可进一步核对freePage已有native页之后两个独立只读、version独立只读的等待成本，必须以故障/settle/发布反例和新测量决定，不减少权限/完整性校验。不要重做已完成模块或更改原计划/目录。真实账户/库存/本人活动/跨端、PAIA、物理IME/弱设备及真人验收仍缺对应条件，完整Free未完成。

第三十三轮同步完成：正常快进push从3e88682到c8ee632成功，API确认PR16仍Draft、head=c8ee632b7b782bc2067c8c8930c81e21b5bc02f1，正文已更新实际测试与性能FAIL。此前未同步说明保留为历史，当前远端以本条和Git为准；未force/merge/deploy。


## 第三十四轮：PAGE与CHECK独立读取并行

从fe07e50继续。PAGE保留native.page先完成，再以同一selectedRefs或显式ids并行workspaceContext/evidence.page；CHECK并行native.version/evidence.header/partitionHeader，legacy fallback只在全部成功后读取。allSettled等待所有分支，按原调用顺序抛首个错误；每仓库权限、字节验证及最终发布屏障均保留，不声称跨仓库原子快照。

新增6项PAGE、9项version合同，涵盖依赖顺序、显式ids、失败等待/错误顺序、scope切换、legacy fallback及分片无fullread。针对性49/49、完整Node774/774（0失败/跳过）；真实headless发布屏障10/10与MV3 9/9。发布报告现在记录六个关键模块运行前哈希并在运行后验证一致。

正常无采样100k三发送功能3/3，1624.1/1662.5/1662.9ms均1秒FAIL；每条只有1个事件/hint/原生用户消息，fullread0，草稿/阅读保持，源码hash稳定。新报告free-round34-*独立保存，不与旧计数相加。包/private/tmp/vaiwl-free-delivery-round34-20261013/vaiwl-free-synthetic-only.zip，SHA256 `96e1da34fea3d10e932c431ebf06c0213cdd21a6e5cdb201b72de1d87de53822`，仍SYNTHETIC_ONLY/NOT_RELEASE_READY。

接续：候选热点为聚合排序的重复时间解析，先比较高重复/部分重复/全唯一分布且严格输出等价；尚未修改生产实现。真实账户/来源/跨端、PAIA、物理IME/弱设备及真人验收条件仍缺，完整Free未完成。


## 第三十五轮：聚合排序时间解析有界复用

从486dacd继续。每次aggregate单独缓存至多256个精确字符串的instant结果，包含null；非字符串仍经原instant，满额后不添加、不淘汰。只复用数值解析，不缓存活动决策或跨scope/版本状态，稳定排序/Project最新成员语义保持。

独立5项合同覆盖非法日期、offset等值、非字符串/空值、稳定ties、跨聚合scope/evidence、超容量、Project及输入不变。针对性Node37/37，实际发布屏障10/10。完整Node和MV3本轮NOT_RUN，最近完整仍Round34 774/774及MV3 9/9。

隔离headless计算诊断首次baseline/candidate中位：高重复41.55/27.20ms、部分72.15/65.40ms、全唯一52.45/52.65ms；随后固定486dacd历史baseline的可复现脚本测41.55/26.65、63.00/54.30、46.25/45.25ms。各3分布100k、预热及交错6轮、完整输出等价，纯计算不当作端到端认证；两份原报告分别保留。

正常100k三功能3/3，1707.4/1596.3/1612.5ms仍全部1秒FAIL；各1事件/hint/原生消息、fullread0、阅读/草稿保持、运行源码哈希一致。既有路径比上轮慢，不宣称整体提速。首次启动的自动审批超时未执行，允许的一次重试成功完成；不是绕过拒绝。包SHA256 `0d60e736d645c2191c37a033d6b9069e66822f9eda6ec58daa85f56fb0bc63ed`，路径/private/tmp/vaiwl-free-delivery-round35-20261013/vaiwl-free-synthetic-only.zip，仍SYNTHETIC_ONLY。

已正常快进推送486dacd且API确认PR16 Draft同head、正文更新Round34。下一具体热点：fixtureObserve先partialContext再ingest导致同100k共享manifest两次读取编码验证；只能考虑同事务的固定用途准备/写入，不能跨事务信任旧对象、绕CAS或更改一般ingest合同。尚未实施，须保留跨ref事件冲突、撤销重放、恢复receipt、quota/撤权回滚及部分成功重试TTL反例。真实源/账户/跨端、PAIA、物理设备与真人验收条件保持，完整Free未完成。


## 第三十六轮：按真实热点筛除无收益候选

从已推送315db11继续，运行时代码未变。新增固定历史baseline、内存候选的隔离诊断脚本，未采用任何候选。真实100k一次CPU profile仅为诊断，不能替代Round35正常发送延迟：strictJSON约281ms、GC145ms、sha256140ms、stable匿名108ms、manifestSize35ms selfCPU。新Project的shared前读约28.6ms、ingest153.6ms、evidence.apply225.5ms、native.apply334.1ms；不能再以“重复前读”为显著收益假设改写事务合同。原profile JSON与压缩原始CPU采样独立保留。

隔离计算结果：manifest容器栈候选中位51.55→51.15ms无明显收益；数字内联候选read/counts在同值、混合、唯一三分布各有快慢，无稳定收益。单遍stream候选保持getter次序/唯一访问与失配继续编码，最初对象表有收益，补测真实数字版本表却19.9→21.6、18.7→19.6、28.2→28.55ms，因此全部不接入。不能选择性只报对象表收益。16Mi UTF16精确边界、非JSON、特殊原型、循环/共享、完整校验和及篡改等价诊断保留各自范围，不称真实产品验收。

新增公开cache API的16项安全反例，完整相关组合90/90通过；无新增runtime改动，本轮完整Node/MV3/正常100k NOT_RUN，最新完整Round34 774/774、MV3 9/9与正常发送Round35 1707.4/1596.3/1612.5ms保持，1秒仍FAIL。包仍Round35 SHA2560d60e736d645c2191c37a033d6b9069e66822f9eda6ec58daa85f56fb0bc63ed。

接续限制：不重复以上无收益编码试验，不为约30ms收益改写共享CAS接口。剩余主要成本是native/evidence/shared全量版本索引根在读写时的编码/完整验证与复制；进一步优化必须先保持有界索引、旧格式读取/恢复、每次完整字节验证和Pro人工资产。尚未实施新的存储格式或授权真实来源。真实账户/来源/跨端、PAIA、物理设备/IME、真人日常验收仍缺条件，Free未完整交付，继续既有计划。


## 第三十七轮：原生版本索引分片基础（尚未接运行时）

从6e88ce5继续；上一提交正常push遭HTTP2 framing，一次45秒HTTP1.1补救超时，最后确认PR16 Draft head315db11。未遗留push进程，不循环重试。子代理本轮额度受限，主代理完成实现与实测。

新增native-version-index.mjs：按确定性ID摘要分桶的不可变目录，原生Project/ref各最多256目录项、总量各100k、原16Mi单记录限制保持；物理key/scope/kind/bucket/revision/count/完整checksum逐片验证。纯迁移构造、完整旧形态还原、只复制触及桶的增量更新均保留原生ID顺序，使用紧凑ordinal数组避免重复长ID。旧根/旧片不修改，未知引用不删除，不含来源授权迁移。旧reader拒绝新格式。完整还原拒绝缺片/多片/重复片与跨桶ordinal冲突。

14项新合同通过，包含增量/稳定顺序、checksum/key/scope/count/routing/order损坏、遗漏/多余片、revision冲突与空库存。最后完整Node809/809，0失败/跳过。真实headless IndexedDB100k基础测试5项通过：迁移往返顺序一致、根/片/marker事务abort保持原样、单条更新仅1桶（本样本395项）、旧checkpoint可完整还原、100001容量拒绝；报告记录最终源码hash。build约403.8ms与单桶计算约2.4ms只是基础计算，不是发送延迟或持久化性能认证；该基础测试与Node同时运行，不用于延迟结论。

另一个独立写入canonical JSON串接诊断完整字节/digest一致，但收益小（同值14.70→14.65ms、混合15.25→14.30、唯一16.10→15.00、对象45.20→41.55），未采用。索引复制隔离探索收益亦不足，未改旧复制逻辑。

当前新索引模块尚未被NativeRepository/worker/build引用，**没有启动真实迁移、没有改变现有包或发送路径**；正常100k仍以前次1707.4/1596.3/1612.5ms为最后证据，1秒FAIL。本轮MV3/正常100k NOT_RUN，实际运行时仍315db11，合成包仍Round35。

直接接续native-repository.mjs/native-partitions.mjs接线：旧格式读取不删除，原事务发布新root+index pieces+native pieces+marker/receipt/共享锚；PAGE只验证目标桶，HEADER完整还原原顺序，版本检查验证根与marker。恢复须验证所有被引用桶及原生片、撤销来源且不重放授权，保留当前/上一检查点的桶和片；损坏/撤权/quota/旧reader回退反例与真实IDB通过前不启用。目录count在未验证桶之前只是声明，不能冒作完整库存见证。此为原F1/B5实施接续，不是第二开发计划。完整Free、真实来源/账户/跨端、PAIA、物理设备/IME及真人验收仍未达成。


## 第三十八轮：同事务索引读取接入原生仓库

接245f92f（已正常推送，API确认PR16仍Draft同head）。新增native-index-reader：每个IDB事务内按目标桶加载，缺目录指针为当前revision的缺项，同桶并发lookup合并；Project依赖从聊天片段发现后继续读取相应桶。完整还原保留旧原生顺序；错误只报告一次并抑制后续成功回调。loadNativePieces保留原checksum/scope/row验证，增加可选版本lookup；旧调用方式兼容。

NativeRepository的read/header/page支持新格式：完整读/header验证所有目录片，按ID页只读目标及成员依赖，offset页仍完整还原顺序；marker/请求revision/末次guard均保持。构建已包含两个新模块。**写入和恢复尚未完成，检测新格式时明确native-index-write-not-enabled/native-index-recovery-not-enabled，避免旧写法或旧shadow降级新根。没有自动迁移或对现有库写入新格式。** version仍走header，不冒称已完成根级快速检查。

新增8项reader合同、相关组合124/124，最终完整Node817/817、0失败/跳过。真headless IDB6项通过：实际repository read/header/page等价、写入拒绝不降级、恢复不从旧shadow重放、同事务Project依赖、完整顺序、缺片中止；小fixture针对查询只读2个index片+2个native片。这是新格式读取接线证据，不是生产迁移/完整写入验收。实际MV3 9/9通过，覆盖仍在使用的旧格式、worker重启、原生草稿/搜索、NONE发送与UNKNOWN作用域。

包/private/tmp/vaiwl-free-delivery-round38-20261013/vaiwl-free-synthetic-only.zip，SHA256 `45e67782bd22c3de7e6cd0a5784d476c85f4a28777ab19a17e33b79dd21330ee`；44文件/37worker模块，SYNTHETIC_ONLY/NOT_RELEASE_READY。正常100k本轮NOT_RUN，原1秒FAIL保持，不把只读接线当性能达标。

接续写入/迁移/恢复时使用本事务reader.records为已加载bucket来源；更新root目录与native pieces/共享锚/receipt/marker须同一CAS事务。Project依赖lookup已就绪，不需为单条更新全量materialize。迁移需完整验证原数据并发布root+所有index片，旧格式及旧source授权不能重放；恢复完整验证目录与native片并撤销来源；GC保留current/prior检查点所需桶和native片，旧checkpoint验证失败不能授权删除。完成这些反例后才能移除新格式write/recovery门控或启用迁移。真实ChatGPT/跨端/PAIA/物理设备/IME/真人条件仍缺，Free未完成。


## 第三十九轮：索引写入、显式迁移和完整恢复

从ab688fb继续。indexed写入同CAS事务发布changed native片、版本桶、root/recovery、旧checkpoint、marker/receipt及共享锚；只读触及桶与Project依赖。GC保留当前和上一checkpoint的native片/索引片，清除更早已验证版本；恢复后无changes时完整核对旧checkpoint，损坏旧checkpoint不授权删除。

新增owner显式migrateVersionIndex：先完整验证旧native片，再原子发布全部索引、revision/marker/receipt，保留来源状态与Pro数据；并发只允许一个expectedRevision胜出，重放不重迁移。新格式损坏根恢复先完整核验所有目录桶和native片，递增revision并撤销全部来源，旧source不能复活。自动迁移尚未接服务，原运行种子仍旧格式；不冒称现有库已自动升级。

新增15项合同通过，最后完整Node832/832、0失败/跳过。真实headless IDB6项覆盖实际迁移双连接CAS、indexed写入CAS/GC、quota/撤权原子回滚、全量恢复撤权及Pro/账号隔离；旧读取接线6项和MV3 9项分别通过。新浏览器夹具第一次因未声明synthetic evidenceGate在seed前拒绝，修复明确合成声明后重跑通过，没有放宽运行时门控。报告free-round39-*保留各自源码hash。

包/private/tmp/vaiwl-free-delivery-round39-20261013/vaiwl-free-synthetic-only.zip，SHA256 `601b78455910990c40ac44cd1e38492bf901ae365594d96b5794df4a2f83d35b`，46文件/39worker模块，SYNTHETIC_ONLY/NOT_RELEASE_READY。正常100k本轮NOT_RUN，Round35的1秒FAIL保持。下一步是有界自动迁移接线与version根级校验，并在实际服务/MV3/100k下验证，不能只以纯索引计算收益认证产品。真实来源/账户/PAIA/跨端/物理设备/真人条件仍缺，完整Free未完成。


## 第四十轮：服务自动迁移、稳定顺序与索引校验复用

接8503b14，已正常快进push并API确认PR16仍Draft同head。ensureNative首次HEADER在旧原生分片上执行owner迁移；CAS冲突只重读一次、下次HEADER再尝试，其他失败不循环、不发布成功。version核对完整root字节/schema与marker，不宣称库存完整；HEADER/PAGE仍验证所需索引与native片。header新增storageFormat区分落盘格式，外部权限不增加。

接线回归发现桶回调顺序导致冷/暖列表顺序不同；loadNativePieces显式保留请求ID与依赖顺序，原备份撤销回归断言未改。首个100k真实测试因每页重复验证几乎全部桶，30秒内未完成首屏，失败报告保留。采用内部512项/8Mi字符验证缓存，每次新读仍完整严格编码比较payload、checksum和scope/kind/bucket/revision/count上下文，变化重新完整验证；不缓存事实对象或授权。暖缓存篡改/错scope/count/routing/order反例保持拒绝。

缓存后100k三发送2352.5/1645.2/1427.8ms，首次迁移后写入还因空changes全量核对GC。迁移本身不改native片版本，现记录对应revision的空变更集，下一写入仅触及所需桶；新增1000ref合同限制读取桶数量并保留全部引用。真实恢复清空changes仍走原完整GC核对。

最终完整Node845/845、0失败/跳过；实际headless IDB6项和最终MV3 9项通过。冻结源码、顺序1k/10k/100k，九条发送功能全部通过：1k 61.2/47.4/47.4ms；10k 148.5/131.0/131.4ms；100k 1281.6/1278.9/1229.6ms，**100k一秒目标仍FAIL**。每条1消息/event/hint，fullread/snapshot0，阅读/草稿保持，最终native格式明确indexed，各运行hash不变。报告free-round40-*独立保存，不加总中间结果；未改6秒RPC、20秒lease或30秒初始测试窗口。

最终包/private/tmp/vaiwl-free-delivery-round40-integrated-20261013/vaiwl-free-synthetic-only.zip，SHA256 `4162206f2cbe5dca2f187b378f9778cbadfe91e7859f5eb4053b96496d3e4da4`，46文件/39worker模块，仍SYNTHETIC_ONLY/NOT_RELEASE_READY。下一可执行验证：实际同路径旧格式包→索引包升级、旧包遇到新格式拒绝且存储不丢、新包重新启用恢复；原Round24同schema回退证据不覆盖新格式。性能仍需处理剩余HEADER/活动和共享索引成本，不重复已无收益的编码实验。真实来源/账户/跨端/PAIA/物理设备与真人条件仍缺，完整Free未完成。
