# Round362：原挂载保留与控制器新绑定恢复

从eee2f26继续。mount surface新增私有rebind，仅双surface关闭、原frame/节点/slot/region完整、owned stylesheet和mask及原生class/style/hidden/aria-hidden一致时，生成同id的新冻结handle并替换documentToken；旧handle失效，原iframe/native DOM不替换。isRebindCurrent提供不写DOM、不清mask、不关闭popover的复核。

controller resumeDormant须先有双frame清空ACK，单飞启动adapter新context，要求不同producer且同browserDocument/origin；复用挂载后按原6秒注册，ACK后再次核对surface完整性与当前inspection，再向原frame发送匹配requestId的WAKE。表面仍等待正常私有JOIN+parent确认；一个grant不显示workspace。失败、超时、route/frame变化清理，reading模式保持原生阅读。

独立mount测试发现native属性校验遗漏，审查又发现注册await后的完整性窗口，均修复并补反例；返回slot断连/跨doc也显式拒绝。完整Node **6998/6998 PASS**（含40项mount测试）。其后新增最后slot连接guard与2项反例，最终33文件 **512/512 PASS**；不冒充最终版本另一次全套。所有结果零skip/cancel。源码hash与日志保留；本轮无新浏览器结果。

仅私有恢复API，尚未由content自动调用：fresh HELLO/REFRESH及同scope校验、同producer关闭与首个休眠发送因果闭环仍需完成。未修改UI grants授权协议、存储或原预算；没有UI-11/Free验收通过声明。原PR16/base/分支及整理stash保持，完整Free继续NOT_RELEASE_READY。
