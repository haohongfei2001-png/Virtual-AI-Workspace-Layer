# BrowserLocal 运行版本一致性修复

状态：**SOURCE_FIXED / OFFLINE_PASS；Mac 新候选 NOT_RUN；Project 挂载 NOT_VERIFIED；FREE_NOT_ACCEPTED / NOT_RELEASE_READY。** 精确冻结提交与同 SHA CI 结果见 PR #16 本批最终交接，CI 结果不通过另一个文档提交移动候选。

## 真实输入与未读取项

基准 HEAD 为 `653ab73e1a5fcc51857a3ae87fcdfe9bf9fc515b`。已核对 STATUS、AUTHORITY、唯一 DEVELOPMENT_PLAN，以及评论 [6556559797](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6556559797)、[6557176212](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6557176212)、[6557372557](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16#issuecomment-6557372557)。Mac 原 ID `miendbcjdmecjggplepenghjnoejmaic`；2957 文件哈希已核对，其中205个为653正式包文件；原单扩展 Reload 的 AXPress 已派发；新建 Project 标签557759500已加载，面板来源/活动标签已绑定。

该真实文档返回 `e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf`，而653正式预期为 `26a6145413a9db5acdfdc57e7643bea119c33fd5623216d1b437727ec2eaea30`。真实 `boot-stage`、`status-code`、`mount-stage` 均保持 **NOT_READ**；下列同名字段仅是匿名隔离实验结果。

## 两个指纹的实际来源

| 提交 | 正式 BrowserLocal BOOT | 实际 content.js SHA256 |
| --- | --- | --- |
| `5593e02eb81b1fc8fda3a12dc945d0280cf67d60` | `e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf` | `212407e91acd10579353d1fae19f3e19893374957e19950ceed068ae8303db95` |
| `30d4cba74854f1a5dfe1e23e6295047cba602976` | `11f5bcbca4838be9001858e0fbdcc6933d8ebf0b160d6a9d882c2fb840c25d6b` | `22c9bcecc9d6c8cb8448f4557ddaef96c8c6b0889708ce34546b2d87bc4beedb` |
| `653ab73e1a5fcc51857a3ae87fcdfe9bf9fc515b` | `26a6145413a9db5acdfdc57e7643bea119c33fd5623216d1b437727ec2eaea30` | `16deb3fa18bee6becd9dc75afd3c8d067f3a54466558a8738992789a66720f03` |

从真实 Git 提交重建，使用锁定的 esbuild 0.25.12。原653 ZIP SHA256为 `d4a7a553293f8ddac70bcdb961b165059ce3ea61763eba0f285840cb993685c8`，重建逐字节吻合。BOOT 的 build 来自 content bootstrap 的闭包常量，不从 storage、页面 DOM 或 Worker 取得；原653实际发送者只能发送26a614…，不能直接产生e287d2…。原manifest只有顶层 `document_idle` 静态 content.js，无 scripting 权限、动态注册或程序化补注入生产路径。

## 确定复现的缺陷与 Mac 仍缺的事实

真实 Chromium 156.0.8078.4、全新匿名 profile、同一扩展路径/ID、正式 BrowserLocal 包、HTTPS 合成 Project 页面与拒绝外网代理下，原5593运行后覆盖653：

1. 不完成扩展 Reload 时，新建文档执行的 content.js 仍是212407…，BOOT仍是e287d2…；同时动态 content-entry 已是653的 `bbd26159ef3e0a23d1292bb42469f2f9a9428a5d3f3145899920e56a9d808511`，popup也从新磁盘读取。这是实际新旧代码混用。
2. 原653 popup接受该组合，报告 `ready`/`show-returned` 并允许解锁；源码只校验64位格式，没有将 BOOT 与自身候选比较。
3. 一次真实 `chrome.runtime.reload()` 后，先证旧 Worker 退出、同ID注册启用且不处于reloading，再新建文档。BOOT变为26a614…，实际脚本SHA变为16deb3…。
4. 干净205文件覆盖，以及保留2752个不被引用的合成历史哨兵、共2957文件的原子目录交换，两种路径结果相同。**哨兵不是Mac原始2752文件清单**；只证明“存在额外文件”本身不足以造成该问题，不证明任意历史目录都无影响。

因此，**新磁盘popup能打开不证明静态脚本注册已切换**，且已经找到并修复版本混用/误接受的确定性源码缺陷。Chrome 官方[重载说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#reload)也区分了popup和content script的更新要求。

但现有实机回执没有 Reload 完成后、在该新文档创建前的浏览器登记版本证据。不能将AXPress成功改写为Reload完成，不能断言Mac点击失败、Chrome缺陷或历史文件就是根因。**剩余最小事实是：该ID当时实际激活的登记代次是否已更新。** 本批通过 manifest.version_name 与执行时版本门建立可检查的登记身份；一次性复验见 HANDOFF，不进行盲目多轮Reload。

## 实施的修复

- 正式 BrowserLocal 将完整 content-entry 依赖图打入唯一静态 content.js；BOOT常量与执行代码由Chrome一起捕获，无运行时dynamic import，保留ESM严格语义。旧入口仍保留兼容路径，但在任何会话副作用前校验登记指纹。
- 同一指纹写入 runtime-build模块、manifest.version_name和BOOT。Worker bootstrap/runtime、workspace/sidebar在发布ready或启动业务前失败关闭，缺登记、旧登记和失效上下文均不得继续初始化。
- popup要求自身预期、当前登记与目标文档BOOT一致，且BOOT阶段为module-loaded。旧BOOT如实显示，状态为runtime-build-mismatch；登记不符为runtime-registration-mismatch；缺失/失败BOOT为runtime-build-unverified。拒绝旧ready/挂载回执、解锁、重连和结构采集；锁定仍可执行。
- 保持原tabId/frameId/documentId/URL/active lifecycle核验及跨通道最终核验。已观察到的文档变化包括A→B→A继续丢弃全部旧值；没有放宽身份或伪造回执。
- 验包从交付包内部重建模块闭包和BOOT模板，核对登记指纹，并重编译逐字节比较content及Worker。旧content被重新填写inventory hash也不能通过。BOOT占位数量必须恰好1；保留的worker源与BOOT模板不得成为公开WAR资源。

运行指纹覆盖模块闭包与BOOT模板，**不是整个ZIP哈希**。HTML/CSS、构建工具及其余产物由208项生产输入清单、实际产物检查和完整ZIP SHA256锁定。未修改Project selector、layout、paint、grant、scope、epoch或srcdoc条件；没有新增权限、网络、宿主结构读取或自动Reload。

## RED / GREEN 与独立复核

- 原653的6项版本/打包反例全部RED；审查发现的4项frame/WAR反例与1项BOOT模板反例也先RED后修复，原输出分别保留。
- 最终相关合同 **316/316 PASS**。
- 正式包同ID升级：基准2/2复现缺陷，修复2/2通过。未Reload仍报告真实旧指纹并拒绝混用；完成唯一一次Reload后，登记/BOOT/实际唯一静态脚本SHA一致。摘要与raw BOOT绑定同一活动主文档；最终再核验；重复content.js会失败。
- 既有BrowserLocal nested Project连续旅程 **36项记录PASS**，含新Worker恢复、新文档锁定、两frame、原生输入、关闭/卸载恢复；该旅程使用loopback配置，其指纹不可用于Mac。
- 护栏变异 **12/12 KILLED**。
- 完整Node首轮12113项中12103通过，10项因隔离副本缺失6个历史Git对象失败。补齐真实Git历史后，仅复跑这8个历史依赖文件，**56/56 PASS**。首轮结果保留，正式同SHA CI继续执行全量门，不能把合并复跑数字称作一次全量通过。
- 三位独立只读审查覆盖构建来源、BOOT/文档绑定和Chrome生命周期；四项实现差额已修复，两项升级测试oracle已收紧，最终无剩余已知阻断。没有修改生产Project架构以猜测实机原因。

隔离runner首次准备也曾失败：CDP loadUnpacked在全新profile不自动打开Developer Mode，导致随后正常Reload禁用unpacked扩展；另一次popup测试重复import造成重复按钮。两者均为测试环境/runner错误，已明确修正，不计为Mac成因或产品GREEN。

## 最终包

- 文件数：208；生产输入：208。
- 正式BrowserLocal运行指纹：`f6fc3d01276442ef1b956af81ce7b56313c7a39fd43ae717f7db2f4dc99ff430`。
- content.js SHA256：`d80427f8374bbbdaa0106a6d935a307e543183048e92a20858b6b4a61c74e29c`。
- ZIP SHA256：`16d778f68beaca0b301c147e198858c7372388d73a90a39f86580a8a12c8fdd6`。
- 未merge、部署或发布；原Mac Profile、扩展、私人数据和其他工作树均未操作。36/36 Project DOM额度不变。

机器证据见 [receipt.json](receipt.json)、[browser-red.json](browser-red.json)、[browser-green.json](browser-green.json)、[flow.json](flow.json)、[green.txt](green.txt) 与本目录保留的RED输出。
