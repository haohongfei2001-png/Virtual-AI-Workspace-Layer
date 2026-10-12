# 结构性优化阶段检查点

F1仍LIMITED，完整当前回归与主线程压力复验尚未完成。提交后从当前branch HEAD恢复，不修改原e626/历史PR/main。

已同步原C34/D12/F1真实Git对象，Draft #11/#12/#13实际存在；分区阶段10975643709a5cf3aea94da68c3a89f9f1a55c1c已同步PR #13，完整bundle在持久recovery/f1-partitions-1097564-20261012.bundle，verify完整历史，SHA256 50ae1e863594c4712568da0a34fcc79882da8e15de3a89a1bd46954ac10a003f。

原失败均保留：完整snapshot客户端6s超时；初分区page1000启动FAIL；5000页后导航p95约290ms FAIL；当前引用URL索引后100k导航43.2ms/搜索33.9ms PASS。真实完整旅程远引用F99999阅读/刷新/新tab、A/B各100k/unknown、人工冲突已通过。每阶段build/source SHA独立。

发现新存储适配缺陷：跨ref复用全局evidence ID未加载旧partition，错误允许覆盖（partition-ingestion-collision-before）。已先保留反例，增加ID locator读取，再交给同一原reducer拒绝冲突；quota异常及put后signal.abort保证manifest/pieces/checkpoint/receipt一起回滚，Node17相关合同/全Node152通过，真实extension IDB15合同也通过。

large-journeys-after-driver 第一组完整旅程有驱动前置竞态：外部原生CAS后下一UI写入尚使用旧revision，正确报冲突；已核实最新title后进入后续测试，原失败截图保留。测试helper return未await导致finally过早关闭db，recovery出现InvalidStateError，改为await内层async结果，不改产品安全断言。

large-journeys-after-collision：真实100k远引用/多tab/移动撤销/文件下载备份/dry-run/恢复撤销/实际worker stopped事件+新boot自动醒/20slease/A-B-unknown-A通过；4x renderer CPU下并发更新原生主线程timer最大3149.8ms，FAIL，原生160消息/input/draft/range节点不变。正在用共同生成器保持同一投影/索引语义，计算每512项yield，计算末再次CHECK绑定和revision，再一次性发布完整scope视图。未改6s请求/20slease、原legacy20k行/16MiJSON护栏。

下一：等待large-journeys-cooperative真实同场景复验；若仍有停顿定位下一同步批次，不能提阈值。然后1k/10k/100k性能及顺序完整既有Node/DOM/真实IDB/页面/MV3/C1/B5/C34/C5/B4回归。新增run-regressions.py可合并执行，均headless新Profile，不占当前窗口焦点。结果完成后SHA矩阵/原A-G STATUS更新、PR #13描述同步，继续原计划依赖满足的独立工作；不是后台承诺或本任务完成。
