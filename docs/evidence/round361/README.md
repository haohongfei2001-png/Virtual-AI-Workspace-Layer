# Round361：原frame清空后的全新授权唤醒

从0bdc0ab继续。frame清空ACK就绪时安装一次性wake入口，只接受实际parent/source/origin与原requestId匹配的精确消息。它先消费入口，再调用原start；正常start/stop/exit都会移除旧入口。唤醒生成新nonce、连接及HOST_UI_JOIN，必须取得新grant后才能渲染，不回填旧权限。清空失败、迟到renderer、onClear重启或旧listener不能提前唤醒。

独立8项反例和只读审查通过。最终27文件 **428/428 Node PASS**，零skip/cancel。实际隔离headless Chrome跨源双frame连续 **5项PASS**：旧render未结束无ACK、分frame确认、精确双ACK、新nonce/连接与重复wake单飞、慢JOIN期间空根无权限及新grant后原frame恢复。无pageerror、源码/runner哈希漂移；仅 **WEB_MECHANISM_ONLY**，runtime是本地固定fixture，不计MV3、自然休眠或生产profile验收。

content/controller尚未自动发起这条唤醒，原mount重新授权及休眠首个发送因果核验仍待完成。不绕过fresh HELLO/REFRESH，不重用过期body proof，不把事后metadata当发送前baseline。UI-11和全Free继续NOT_RELEASE_READY；原目录/分支/PR16/base及整理stash保持。
