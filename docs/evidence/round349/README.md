# Round349：续租过期与启动重入修复

基线104ea67，唯一生产改动 src/host/ui-frame-client.mjs。UI-11调查继续发现两个可执行生命周期缺口，均由独立反例先证明。

- 原10秒grant在5秒开始续租；10秒精确边界或10.5秒收到新ACK，request仍在原6秒预算内，但旧expiry timer任务尚未执行。旧代码错误重新授权并渲染（2 FAIL / 1正常对照PASS）。现在请求前、ACK后都检查旧lease仍有效，过期清屏并停止；新增延迟renew timer本身不发RPC的反例。未延长TTL或重置请求预算。
- 活跃client再次start，内部stop的onClear同步调用新start。旧外层继续创建第三port/重复JOIN，并在停止后泄漏第二port及其监听器（2 FAIL / 1正常对照PASS）。现在外层预先确定下一epoch，stop返回后发现较新生命周期便立即返回false；正常start和exit→onClear重入保持。

最终13个相关文件237/237 Node PASS，0 skip/cancel，包含两个独立反例文件、ui-grants、surface、geometry、content恢复等。独立只读复审无阻断。原失败日志完整保存，不累计中间通过次数。本轮未运行浏览器，不宣称自然休眠或完整MV3验收通过。

UI-11待办仍是按现行合同完成双surface关闭后的待命：保留空frame、释放旧授权与timer、原生始终可用、四格返回重新授权。生产当前仍周期续租，本轮没有伪装该功能完成。MODERN C2在worker退出后不能凭返回点击重造context receipt；需要真实合规上下文证据，不能延长TTL。待命期间发送观察与既有预算仍须保持。

有界正常push尝试45秒无完成，进程组SIGTERM后终端-15；未强推，远端结果未确认，保留本地检查点，后续fetch核实。整理stash与副本不动。完整Free、100k、cold context、其他81/J1–J4/G/U仍未完成，NOT_RELEASE_READY。
