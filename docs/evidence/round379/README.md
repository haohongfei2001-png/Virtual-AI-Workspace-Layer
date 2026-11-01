# Round379：实际生产包的原生准备与 partial metadata 恢复

基线 6fd971d2122bfbe420855dff0735e3a8c687a44a。继续原分支/PR16；本轮只有离线 fixture、runner、测试与证据，没有生产代码修改。

新增未插桩 production package 的隔离 headless MV3 场景，LEGACY/J2 本地重建、offlineFirstSend 显式测试 profile、独立临时浏览器、既有 worker 外网 guard 配置、无 worker debugger。fixture 的测试进程控制只将旧 message parent 临时改为缺失节点，真实 parser 得到 partial；恢复不改原生行/日期/页面。控制不暴露 HTTP 路由，独立 Node 验证未授权请求不计成功响应、恢复深相等。

正式单次 **2 项 S 子检查 PASS**：首次 partial 200 后，同 document/editor/reading/message 节点与 ID、双 frame 保持，等原每秒准备间隔后，仅恢复服务器 metadata 并真实 Input 点击 editor。发送前完整 200 从0增1、partial保持1、detail GET恰增1。然后通过原生 mode 控件和真正 submit，仅一次 fixture native send；只读扩展 frame 的真实 IndexedDB 精确核对唯一 observed-self-send 锚等于服务端成功消息 ID，无 sentAt、无强事件、source未撤销，重复只读不续锚。

首跑在发送前因错误要求 auth/accounts 不增加而 FAIL：既有 session-provider 每次 metadata read 本就重新核验 session/accounts。最终断言改为两者各恰增1，未改生产行为、deadline或预算；原失败及 hash 匹配的原 runner 留档。

独立反向变异只修改临时解包的 src/host/chatgpt-adapter.mjs，在 prepareNativeBody 入口立即 return。精确 before/after hash 与 runner 归档；正式源码未改。相同场景在发送前 same-body-explicit-prepare-reread 原6秒断言 FAIL，partial=1/full=0、没有原生发送，证明断言依赖准备重读接线。变异 FAIL 是预期负证据，不计正式 PASS。

正反运行源码/runner/fixture/manifest均无漂移，正式包 loadedPackageChanges=[]；临时变异仅一文件。独立审查通过。最终 fixture相关 **18/18 L PASS**、完整 Node **7186/7186 PASS**、零skip/cancel。

边界：成功服务器响应不单独证明哪个 worker reader 消费；最后 ACK 可能来自 firstSend，不能仅凭锚声称 sendCandidates 自身完成 ACK。没有本轮外网拦截负探针；guard沿用既有已测配置。仅此 partial 恢复 S 子链，非 transport-error、自动休眠、立即首发、完整 J2/81/100k/G/U 或真实账户验收。Free NOT_RELEASE_READY。
