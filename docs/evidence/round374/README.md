# Round374：首次ACK来源未落库时的真实IndexedDB修复恢复

基线 d20ffd1bf4d12d760575db51f1661b126d3c993c 已同步原 Draft PR16、tracking 0/0。继续原目录/分支。本轮只增测试，不修改生产源码或数据库 schema。

将现有 binding/provider/owners/repositories 的离线事实 fixture 做成便携组合，显式注入浏览器原生 IndexedDB；真实调用 HOST_HELLO/REFRESH，但 frame、HTTP 响应、时钟、DOM观察均为测试事实，不是实际账户或生产Host授权。测试在首次 continuation apply 前显式返回中断，只改已存在历史Evidence root的checksum，再执行正式recover。未模拟物理崩溃、quota或真实worker停止。

最终新隔离headless Chrome 155.0.8059.80、无host权限且 connect-src none 的测试扩展，扩展源 [object IDBFactory]、secureContext=true：单次 **3/3 PASS**，D_REAL_EXTENSION_ORIGIN_INDEXEDDB_TEST_ONLY_COMPOSITION，sourceIntegrity=PASS/sourceChanged=false/errors=[]。

- 未曾落库的ACK source在无关历史Evidence修复后仍缺席；重建owner、真实HELLO/REFRESH获得不同grant，旧proof失效，同一pending完成，原anchor/来源有效期等记录值保持，只有一次Evidence CAS。旧历史来源仍撤销，不重放原生delta或metadata请求。
- 原生来源实际撤销后同pending进入needs-revalidation/source-revoked，无ACK或Evidence receipt被造出。
- ACK profile revision变化后进入needs-revalidation/profile-changed，同样不产生ACK。

三个场景均保持人工workspace sentinel及native记录；再次重新授权后Evidence与terminal记录值不变。每次恢复仅原session/accounts两GET，metadata GET为0。这里用规范化记录摘要对比结构和值，不声称枚举八表或底层存储原始字节。owner重建仍复用provider/repositories，不称整worker冷启动；不认证全部Pro资产种类或跨scope矩阵。

独立审查修复测试初始化异常时漏清理：fixture构造纳入finally范围，所有已登记清理独立执行，最后仍尝试删除测试数据库。新增初始化失败回归，最终相关Node **27/27 PASS**，零skip/cancel。清理修复前一次3PASS报告单独保留，不与最终结果相加。prepare-only不冒充D；最终运行报告含准确suite注入/授权标签及源码hash。

对应SYS02恢复与SYS01持久admission边界的补充D。productionHostS/真实账户/完整J4仍NOT_RUN，原连续J4里的missingInitialACKSourceContinuation仍不能改为S已覆盖。未解决现有existing-source S的严格native witness前提、100k/即时cold context/剩余81项/G/U。Free NOT_RELEASE_READY。
