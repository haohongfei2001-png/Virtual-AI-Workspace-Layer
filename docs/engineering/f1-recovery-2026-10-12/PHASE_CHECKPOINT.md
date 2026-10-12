# 结构性优化阶段检查点

F1仍LIMITED，完整当前回归与主线程压力复验尚未完成。提交后从当前branch HEAD恢复，不修改原e626/历史PR/main。

已同步原C34/D12/F1真实Git对象，Draft #11/#12/#13实际存在；分区阶段10975643709a5cf3aea94da68c3a89f9f1a55c1c已同步PR #13，完整bundle在持久recovery/f1-partitions-1097564-20261012.bundle，verify完整历史，SHA256 50ae1e863594c4712568da0a34fcc79882da8e15de3a89a1bd46954ac10a003f。

原失败均保留：完整snapshot客户端6s超时；初分区page1000启动FAIL；5000页后导航p95约290ms FAIL；当前引用URL索引后100k导航43.2ms/搜索33.9ms PASS。真实完整旅程远引用F99999阅读/刷新/新tab、A/B各100k/unknown、人工冲突已通过。每阶段build/source SHA独立。

发现新存储适配缺陷：跨ref复用全局evidence ID未加载旧partition，错误允许覆盖（partition-ingestion-collision-before）。已先保留反例，增加ID locator读取，再交给同一原reducer拒绝冲突；quota异常及put后signal.abort保证manifest/pieces/checkpoint/receipt一起回滚，Node17相关合同/全Node152通过，真实extension IDB15合同也通过。

large-journeys-after-driver 第一组完整旅程有驱动前置竞态：外部原生CAS后下一UI写入尚使用旧revision，正确报冲突；已核实最新title后进入后续测试，原失败截图保留。测试helper return未await导致finally过早关闭db，recovery出现InvalidStateError，改为await内层async结果，不改产品安全断言。

large-journeys-after-collision：真实100k远引用/多tab/移动撤销/文件下载备份/dry-run/恢复撤销/实际worker stopped事件+新boot自动醒/20slease/A-B-unknown-A通过；4x renderer CPU下并发更新原生主线程timer最大3149.8ms，FAIL，原生160消息/input/draft/range节点不变。正在用共同生成器保持同一投影/索引语义，计算每512项yield，计算末再次CHECK绑定和revision，再一次性发布完整scope视图。未改6s请求/20slease、原legacy20k行/16MiJSON护栏。

下一：等待large-journeys-cooperative真实同场景复验；若仍有停顿定位下一同步批次，不能提阈值。然后1k/10k/100k性能及顺序完整既有Node/DOM/真实IDB/页面/MV3/C1/B5/C34/C5/B4回归。新增run-regressions.py可合并执行，均headless新Profile，不占当前窗口焦点。结果完成后SHA矩阵/原A-G STATUS更新、PR #13描述同步，继续原计划依赖满足的独立工作；不是后台承诺或本任务完成。

追加进度：af706ce4d442d839df71578eef77981b268f066b已同步#13。协作式全量计算保留完整读一致性，但4x timer仍3216.8ms FAIL；background postTask使定向输入profile降至184.7ms，仍FAIL。实际CPU profile热点localDay/instant/replicaState/URL/index，GC样本较少，不能把全部延迟归为GC。改为同一dataProjection仅重算变更引用关联主题，source/clock变化保留完整重算；可复用同scope且身份/事件/placement顺序不变的私有URL索引，最终再CHECK不发布过期结果。定向输入降159.9ms，仍坚持150ms阈值。profile热点剩prepare/complete两个Map构造，改为512项复制、分批yield，正在input-profile-bounded-maps复验。

另保留PART16真实引用顺序反例：原delta删除再插入T0将其移到数组末尾，已修复为manifest规范顺序；affected theme增量对title、MOVE、顺序、workingSet、source撤权逐项与完整read比较，22相关Node合同全部PASS。真实扩展IDB17合同通过（当前新layout），不使用mock冒充。活跃heartbeat检测损坏现直接进入同一B5已核验资产恢复UI，暂停而不删除未提交人工草稿；large-journeys-background实际UI恢复100k与最新人工数据已PASS，旧证据/收据失效。

仍不是完整F1通过；input定向诊断不代表全部旅程。完成后必须回跑原9项完整100k旅程、1k/10k/100k性能、run-regressions的既有完整工程套件。旧失败、CPU profile、所有源码/build SHA留在各独立证据目录，不能改旧报告掩盖失败。

完整100k真实MV3增量首次9/9 PASS：large-journeys-locator-boundaries。包括原18项真实扩展IDB合同、远F99999/native阅读、刷新新tab、手工冲突/原生连接CAS、移动撤销/实际下载/readonly dryrun/restore撤销、真实stopped事件+不同boot无刷新醒、20s lease、A/B各100k/unknown、4x CPU长160消息并发输入/原导航阈值、真实损坏UI恢复最新人工title和工作集且旧证据/收据失效。4x导航137.4ms/搜索74.8ms，原生timer最大43.4ms（同一轮），最大观察到成功RPC1340.6ms/page5750807字节。6s/20s未变。不是物理弱设备/生产ChatGPT认证。

保留随后完整反例：移/撤销在lease尾部发生真实commit但client被expiry清理而反馈未确认。最小修复在发送人工作业之前不足6s余量时仅BIND+读最新验证同scope，不重放或自动重试任何写入。旧6s/20s边界仍保留。元数据长同步checkManifest也被拆为共同校验生成器，16Mi JSON码元用无大字符串的严格长度计数，key排序不影响长度。新增缺root+人工历史时误判为空的反例已修复，legacy/partitioned都recover最新human；Node158通过。新增16Mi护栏+损坏共享piece安全拒绝/完整human导出合同Node22通过，待真实extension补测后整体全量回归。

性能驱动原page.evaluate找DOM在actual lease卸载与重连之间有check-to-use竞态。改用实际控件locator.evaluate，并把点击后发生的重连停顿包括在样本，不重试导航业务、不减20/10样本或阈值；worker/lease仍独立实际验收。失败截图和全部原reports不改。接下来顺序真实新Profile验证新增native20、1k/10k旧布局与100k新布局性能、既有全量DOM/真实IDB/Page/MV3/C1/B5/C34/C5/B4，源码/构建SHA逐份对应。F1完整当前验收未最终完成，继续执行不阶段停止。
