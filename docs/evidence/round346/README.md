# Round346：MODERN嵌套app-root完整J3功能旅程

基线7499f8d，未改生产源码/fixture/原16步。新增显式J3_STARTUP=registered-worker；默认immediate保留Round345实际失败对应的运行方式。复用已有sys05-startup-precondition，只检查exact worker身份及JS listener注册，不生成context receipt，也不宣称浏览器网络监听安装完成。

最终模式同一个15秒绝对预算覆盖worker发现/注册检查、addInitScript、新页面导航、原生节点标记、首次双workspace检查（含原RAF/200ms）。检查不续期，迟到完成拒绝，异常进入原finally关闭context。首次运行16/16通过后，将此前仅在workspace检查剩余时间改为整体导航也受deadline.run约束；两份结果分别保存，不累加为32项。

最终原16步连续 **16/16 PASS**，启动耗时491.131ms，进程正常exit0。真实打包MV3、隔离headless、本地MODERN独立Team oracle、app-root嵌套。涵盖双surface、原生model/file/权限fixture、两个草稿原节点、AX可信键盘、SPA Back/Forward、真实Chrome200%缩放、较早区间/安全新tab/重开、UNKNOWN可达、原生Range保存/搜索/定位及最后原生搜索。worker外网阻断，errors为空；source/fixture/script无漂移，构建清单未变。

72/72定向Node验证（含已有绝对budget/只读注册检查反例与J3合同）通过。新helper已加入fixtureSourceHashes。此轮不是完整Node全套。

结果仅为 **REGISTERED-WORKER前置下的MODERN嵌套J3**。coldStartAcceptance=NOT_TESTED，注册不是当前context授权；原Round345立即导航缺send失败完整保留。物理IME、真实ChatGPT、生产snippet profile、完整UI06/v2.7/81、静默context和100k等门槛未被本切片证明，Free NOT_RELEASE_READY。
