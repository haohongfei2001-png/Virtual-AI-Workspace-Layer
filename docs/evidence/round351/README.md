# Round351：待命撤权端点，自动进入尚未接通

基线8197cf1。此前三个积压commit已通过仓库现有exact Git对象传输同步原Draft PR16；逐对象SHA核对，远端head/tree匹配，base仍原PR15。独立API核对后本地tracking expected-old更新，0/0。原normal Git超时记录不删除。无remote配置/分支/目录变化。

生产UI frame现在接受严格同parent/source/origin、精确{type:VAIWL_UI_IDLE,role}的单向撤权消息：清私人DOM、取消expiry/renew/request、断port和listener，并使pending join/renew晚回复失效。没有wake消息、没有延长lease或恢复旧授权；后续仍需完整新start/private grant。父通知仍沿现有SUSPEND。

独立10项新测试涵盖错误source/origin/role/extra/prototype/array、合法清理、pending join/renew晚ACK、旧listener不能影响新epoch。最终相关14文件247/247 Node PASS，无skip/cancel。未运行新浏览器，不宣称自然休眠通过。

自动隐藏标签页idle尚未接通。审查发现adapter的RAM intent、worker pendingACK与原子native提交前状态不能因hidden直接abort；inputRisk clear或s.ready不是无待处理发送的证明。下一依赖是同producer发送/确认与提交边界的安全idle准入，保留已持久continuation及原预算；然后controller保留空frame、取消parent续租、content foreground完整新授权。当前父controller尚未发送IDLE且现有SUSPEND会dispose，因此不能把新增frame端点标为完整待命或UI11 PASS。

此前cold首GET missing-send无新可信信息可补，保留FAIL。生产profile缺真实来源认证，不将fixture配置提升。完整Free/100k/其余81/J1–J4/G/U仍NOT_RELEASE_READY。
