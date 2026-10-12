# VAIWL Mac 本地连续实施交付与恢复

本次从现有完整临时checkout恢复至持久目录 `/Users/hhf/Documents/Codex/VAIWL-Development/c1`，对照实时PR #6–9后继续开发。原main checkout干净。按原A–G连续完成多项增量，没有重新制定产品目标、没有阶段等待续令。尚未完成所有获准任务；当前会话状态和原始证据已形成Git提交及完整bundle，未宣称后台持续运行。

原ZIP SHA256 `e3b45a4ed7ee6363b896683b5bec38c26ca2568fb106badc46cc8541034c965d`、HTML `81fa9779e4bc98b6b67c348f72a32ee1fd99519833994af9ed95716126f7da4e`匹配，安全解压原件进入design/approved/v2.7，历史附件指令未扩张用户授权。正式路线仍DEVELOPMENT_PLAN，逐项A–G状态见[STATUS](../STATUS.md)。

| 模块/实际成果 | 状态与提交 | 工程证据 |
|---|---|---|
| C1设计一致性 | Draft [PR #9](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/9)，远端a0552467f732e40adb7852c04f3e4343ff0431fe | [差异矩阵](c1-fidelity-2026-10-12/DIFFERENCES.md)、[验收](c1-fidelity-2026-10-12/ACCEPTANCE.md) |
| B5备份/迁移/恢复/配额/人工保护 | Draft [PR #10](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/10)，远端8d19020978c6ce79e23862dc9cd22d88848bdfe9，base #9 | [验收](b5-mac-2026-10-12/ACCEPTANCE.md)；最新人工修改丢失反例已修复 |
| C2复用、C3/C4工作集/片段、C5可独立部分 | 本地codex/vaiwl-c3-c4-context-20261012，38ea47dbd85a51951c3b5dbd283d2b088288b3f4，父B5；未推送成功/无新PR | [验收](c34-mac-2026-10-12/ACCEPTANCE.md) |
| D1/D2离线保守建议实验 | 本地codex/vaiwl-d1-d2-offline-20261012，3afaf33f99de45a793c0acf3c953d5255c66b4e5，父C34；未推送成功 | [1200条及质量限制](d12-offline-2026-10-12/REPORT.md)，运行时未启用 |
| F1性能及容量 | 当前本地codex/vaiwl-f1-performance-20261012，父D12；运行时801595e239d1fbacf7f243f7ab46862612be75a7，最终文档/证据commit取branch HEAD；未推送成功 | [验收与未解决100k缺口](f1-mac-2026-10-12/ACCEPTANCE.md) |

## 原设计与真实界面

原48px标题栏、13px卡片、25px语义图标、3列/346基准/18间距、窗口glyph/分支线、5项默认/+12、轻量无框chevron、侧栏主题层级已修复。30当地日/当前无上箭头/历史相邻连续/主题独占/主页不可整卡折叠/父主题内左侧旧窗口/未知查找可达/唯一阅读返回保持原Canonical。人工图标/名称/顺序/别名与数据库一致。原型6主题17窗口与实际120/604不同，未缩样本迁就截图；实际原生header/composer保留导致留白差异。没有真人首次发现性、真实ChatGPT插槽/字体/工具或PAIA认证。

最终同1440×1000原图/实图及真实Chrome交互截图：

- [原型浅色](f1-mac-2026-10-12/final-journeys/c1/approved-original-light.png) / [最新实际浅色](f1-mac-2026-10-12/final-journeys/c1/approved-implementation-before-check.png)
- [原型深色](f1-mac-2026-10-12/final-journeys/c1/approved-original-dark.png) / [最新实际深色](f1-mac-2026-10-12/final-journeys/c1/approved-implementation-dark.png)
- [430×932窄屏](f1-mac-2026-10-12/final-journeys/c1/approved-implementation-narrow.png)、[旧窗口](f1-mac-2026-10-12/final-journeys/c1/history-expanded.png)、[长列表](f1-mac-2026-10-12/final-journeys/c1/long-list.png)、[真实200%](f1-mac-2026-10-12/final-journeys/c5/actual-chrome-200-percent.png)
- [工作集](f1-mac-2026-10-12/final-journeys/c34/working-set.png)、[手工片段搜索](f1-mac-2026-10-12/final-journeys/c34/snippet-search.png)、[损坏冷启动](f1-mac-2026-10-12/final-journeys/b5/corrupt-cold-start.png)

## 功能覆盖与实际限制

| 功能 | 当前证明 | 未覆盖/限制 |
|---|---|---|
| v1→v2/结构错误回滚 | 实际Chrome IDB原生测试 | 同一DB无破坏性reset |
| CAS/幂等/撤销/人工优先 | Node+54原生IDB+多tab MV3 | 沿用原实现，未另造协议 |
| 20秒lease/worker实际停启/旧结果隔离 | MV3原始停止事件、不同boot、B4旅程 | CDP成功返回本身不作为停机证据 |
| A/B/unknown、原生节点/草稿/工具 | page/MV3/C1/C34/B4正反旅程 | 合成身份resolver；生产resolver禁用 |
| 最新人工资产恢复 | 检查点+连续校验human patch，所有旧证据/收据失效 | 双损坏/日志缺口拒绝；需要外部保存的文件备份，不保证所有故障无损 |
| 资产文件/dry-run/CAS/安全回滚 | 实际下载、预览不写、并发人工保护、undo | 完整聊天/云native权限不备份；仅用户选中片段进入资产 |
| 配额拒绝 | 实际IDB store.put注入QuotaExceededError原子回滚 | 不伪称OS磁盘实耗尽 |
| 视图损坏 | 保留完好workspace、单独diagnostic | 不自动覆盖损坏原件 |
| 工作集/惰性原生路由/返回现场 | 实际多tab/原生Back/Forward保留/来路展开和滚动 | 不备份原生草稿/agent/交互状态 |
| 派生查找/选中片段定位 | 同scope唯一msg/branch/body hash，编辑后原生查找fallback | 不后台采集、不伪称全账户索引/未知格式迁入 |
| 1k/10k性能 | actual MV3 / extension IDB，10k切段p95 50ms、搜索32ms | 此Mac/合成metadata；正式100k拒绝未通过，临时放宽护栏仍启动FAIL；弱设备/大规模多tab待补 |
| D1/D2 | 1200模板困难样本、稳定与人工/证据保护 | 覆盖16.67%，无独立自然语料gold，98%/90%未认证，无运行时AI分类 |
| C2/C5/C6真实宿主 | 未运行 | 真实ChatGPT/PAIA账户与清洁环境需独立授权 |
| E/F2/G1/生产F3/F4 | 未启用 | 原生写入、同步、PAIA、部署/发布权限均未获准 |

最新完整回归：Node135、DOM49（mock层）、原生IDB54、正常页面17、MV319、C1 UI10、B5 UI3、C34 UI3、C5 UI2、B4核心5/实际生命周期1全部PASS。不能把不同阶段测试次数相加当更大覆盖；原命令/source/build hash/worker原日志在F1 regression与final-journeys。环境及实时远端PR见continuous-final-2026-10-12；`python3 tests/f1/verify-evidence.py`检查最终运行结果、当前runtime hash和manifest。

## 已修复与仍未解决

修复：C1视觉/图标/默认列表/卡片列数、打包遗漏图标模块、深色分支线；B5检查点恢复丢最新人工修改、损坏冷启动安全修复反馈、低频备份状态重复status；C4片段搜索命中却显示无结果；F1全表重复扫描/Intl格式器导致10k超时。驱动问题独立留档，不把全部失败归因环境。

仍未解决：100k真实容量与完整F1各场景；D1/D2可靠产品质量证据；真实host/真人/PAIA部分。当前容量护栏是代码限制，需要在既有数据库/CAS/恢复安全内增量解决，不能通过缩数据或只提高常量宣称完成。其他权限受限项按原任务依赖等待，未改目标。

GitHub普通Git传输后续反复HTTP2/75秒连接超时/有界HTTP1与IPv4/Empty reply失败，API读取可用；没有修改网络/系统安全策略、强推、制造平行C1 PR或逐文件API开发。C34/D/F尚未远端交付。完整本地分支、原始证据、恢复bundle已保存，见[检查点](CONTINUOUS_CHECKPOINT_2026_10_12.md)。待Git端点恢复，先核对远端head再依次正常push/stacked Draft PR；不循环网络重试。没有部署/合并/真实账户活动或后台持续任务。

100k补充诊断已实际执行两次并保留：临时实验构建可写100000引用，但写约12秒/快照5.3–5.6秒，正常页面不能进入ACTIVE；补真实broker trace确认BIND/快照曾返回ok而客户端重绑并保持WAITING。只改临时构建与诊断驱动，正式容量限制、6秒请求时限和20秒lease均未降低。不能以全量大包成功写入证明完整用户路径/人工保护通过。默认护栏另以真实原IDB人工sentinel重验，拒绝100k仍不丢原资产。当前F1重大容量/启动缺口如实未解决，恢复从该反例继续，而非重开设计或重做B1–B4。
