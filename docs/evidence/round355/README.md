# Round355：覆盖超时与取消后仍在运行的Host工作

从975c1c3继续，前轮已提交并同步属于实际进展。沿用正式目录、分支与PR16，整理stash及副本不变。

补齐已确认的异步计数缺口：view全部7个withScope入口；UI owner授权、scoped callback和续租；scope identity/context读取；continuation实际run及队列选择；metadata provider及历史/readback回调。原deadline/abort可以先返回，但底层Promise未结束时仍拒绝idle。原执行顺序、guard、忙状态释放、时间预算和数据库合同不变，idle读取不产生网络/清理/续期。

本轮仍是内部就绪信号的实现，尚未提供原子producer冻结/关闭操作或连接controller dormant；不声称UI-11自然休眠通过。全局snapshot不能替代授权。保守残留记录及所有tab聚合可能暂时阻止休眠，后续需要在不丢在途用户工作的前提下完成实际生命周期接线。原100k/真实profile/G/U及完整Free仍NOT_RELEASE_READY。本轮不访问真实账户、不运行浏览器。

原生observation的ingest/withCurrent/joint commit、ingestion pass在途工作也纳入聚合。未结束pass保守阻止idle，不在查询中读取时钟或删除pass。独立审查未见本轮限定范围内语义回归。

首轮完整Node：6871项，6856PASS/15FAIL。失败均为诊断插桩源码锚点沿用封装前字符串；保留原失败日志，修正锚点时必须保持唯一匹配与篡改失败检测、原注入语义，不能降低验收阈值。

最终诊断相关72/72通过；read-error仍只对begin零参数刷新前三次注入失败，autoH带参数刷新不消耗注入计数，新增实际refreshOwner计数反例。最终完整482文件 **6873/6873 Node PASS**，零skip/cancel，exit0。tested-files.json记录此次代码与测试SHA256。
