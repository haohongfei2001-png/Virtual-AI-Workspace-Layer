# Round358：身份读取超时后的底层工作保持可见

从035d048继续。isolated-session-reader增加内部prepareIdle快照；逻辑read与原始fetch/JSON/流清理分别计数。调用方超时或abort提前返回不清除原始pipeline计数，迟到reader.cancel/releaseLock结束前仍不可准备。每次read同步增加revision，旧快照不会因后来排空复活。原预算、身份验证、token清理与错误脱敏保持，不产生新网络请求或权限。

独立6项反例覆盖成功、真实deadline、外部abort、迟到fetch、body read/cancel及旧任务跨新读取。独立只读审查通过。最初33项相关测试中1项只因API精确key列表新增prepareIdle失败；更新精确列表，其余断言保持。最终11文件 **265/265 PASS**，零skip/cancel；原失败日志保留。上一检查点完整Node6898通过不冒充本轮全套重跑。

content仍需实际IPC、完整操作链和同步revision接线；adapter原始dispatch必须纳入最终聚合。当前新增局部快照不等于原子冻结/关闭，也未启用自动待命。无新浏览器验收，UI-11/完整Free仍NOT_RELEASE_READY。PR16/base、原目录/分支和整理stash均保留。
