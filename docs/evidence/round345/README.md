# Round345：附件输入覆盖与MODERN嵌套J3实际边界

基线f911497；同正式目录/分支/PR16，原整理stash与副本保留。

## 原生未保存风险

公共reader允许窄filesSelector，却只检查选中的一个file input。同一form新增隐藏的其他file input时旧实现可错误返回clear。独立19项旧代码9PASS/10FAIL（attachments-red.tap.gz）；修复前后枚举form内file input，要求唯一且与profile选中节点一致，复核连接/document/type/contains，不读文件名/内容。不改变当前打包离线profile的全局selector，其原多input检查已为unknown；不声称真实ChatGPT曾漏报附件。

输入风险97/97；包含其自身及原生导航/计划/J3合同的最终17文件241/241，无跳过/取消，不将重叠结果相加。真实隔离headless DOM 12/12 PASS，外网阻断、原节点和内容保持、源码及runner无漂移。包含隐藏空文件输入、隐藏选中文件输入以及移除额外输入后的clear。证据等级严格为WEB_MECHANISM_ONLY，非MV3/真实profile验收。

## 未覆盖组合的实际执行

原runner运行FREE_J3_PROFILE=MODERN、J3_LAYOUT=app-root（原15秒、原全部步骤未修改）。正式未插桩包FAIL，0步完成，首个workspace超时；原生body可见，page errors为空，源码/fixture/构建无漂移。原记录modern-j3-app-root.json.gz，不用历史direct或LEGACY嵌套通过抵消。

随后仅一次既有J3_CONTEXT_TRACE诊断模式，仍FAIL、0步；监听器安装后只见browser-complete known=false/status200/cached=false，没有browser-send；HOST_HELLO成功，HOST_REFRESH ambiguous，contextReceipt=false，原生body可见。诊断包与正式包区分，不能把该结果当原包验收。该证据确定当前owner未取得配对发送事件，不能凭成功响应/roster/DOM补当前选择授权；不能据此认证完整MODERN嵌套体验或定位所有冷启动根因。

两个浏览器进程均终态exit1，未延长期限或反复重试。后续该组合仍需合法context来源后完成全旅程；缺少C1文档/selection-epoch证实来源的原限制保持。100k完整库存、其余81/profile/J1–J4/G/U及完整Free继续开放，NOT_RELEASE_READY。

生产文件SHA256：`ff4407f492fec8c4677ecab8eb2ca69f1b5fb1bfaeb39f38213030b16ba1b0b5`
