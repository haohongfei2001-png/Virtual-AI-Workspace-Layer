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
