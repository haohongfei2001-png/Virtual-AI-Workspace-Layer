# Round364：退役发送监听与实际挂载释放

从593860d继续。真实被动send observer在DOM边界读取、时钟/ID生成、first-send回调及operation读取之后重新检查stopped，已退役手势不再继续交付给replacement producer。正常可信手势、IME、去重与原生输入语义不变。独立13项测试旧源11FAIL/2PASS，修复后通过；不宣称物理IME或真实宿主通过。

实际HOST_UI_RELEASE以前只撤销UI owner，未停止view准备任务。现由UI owner在已鉴权且registration删除的同步点调用既有views.revokeMount，先退休view/timer再断port；不在await回包之后按mountId清理，避免误删新注册。仅真实删除才调用回调，防同id递归；finally保证清理回调异常时旧UI documents/ports仍撤销，失败不伪报成功。其他document/tab/stop清理沿用现有路径。

独立实际service测试覆盖准备timer/前台窗口、非法释放、兄弟mount隔离、同id新注册及旧page迟到；拔除接线的独立变异为3FAIL/1PASS。root追加清理异常及同步递归两项；独立审查通过。最终相关 **1467/1467 Node PASS**，零skip/cancel，清单与源码hash附录。没有重复全套或新浏览器结果。

未新增无调用关闭协议，未启用自动休眠。仍需同producer收束许可、content自身RPC与外部干扰区分、双frame ACK后的释放整合，以及休眠首个发送因果；不得靠清pending或复用过期proof闭合。UI-11/完整Free继续NOT_RELEASE_READY，既有自然worker退出NOT_ESTABLISHED及100k FAIL保留。无真实账户/PAIA/付费/部署操作。
