# B2/B3 最终云端工程验收

2026-10-11。PR #7；只修改 `feat/vaiwl-b2-b3-persistent-20261011`。代码基线从真实 GitHub 恢复到 `5997ec072f2f97c8127f41f05b9f375a786b6f10`，本轮最终代码提交为 `8041f1dbfd3350b2cbead0651b04f9da6574a5ed`。之后仅归档证据和更新文档，未改变已测试运行时代码。

## 裁决

**云端可执行范围的审计、必要修复与回归已完成；整体 LIMITED，不是完整持久化/MV3验收通过。** 现有 B2/B3 已有真实 IndexedDB 实现、迁移和可操作管理界面，不是接口骨架；但当前云端通过的数据库合同使用 mock-IDB。真正浏览器的磁盘持久化、刷新/新标签/worker冷启动仍未获得本轮增量通过证据。不能把“实现了持久化代码”写成“原生持久化已验收”。

本轮没有 Mac/DC、私人数据、真实 ChatGPT 登录、付费模型、额外云服务或 GitHub Actions，没有新建/合并 PR，没有修改 main、PR #1/#4/#5/#6 或其他仓库。旧中断提示的具体服务端原因未获得诊断；通过分阶段提交防止再次丢失工程成果。

## 实际执行账本

| 层级 | 最终结果 | 证据与边界 |
|---|---|---|
| Node 全套 | 118/118 PASS，exit 0 | B1/HF/B23 全部合同、构建、HTTP服务和新回归；IDB使用明确标识的mock |
| Chromium DOM 全套 | 49/49 PASS，exit 0 | 原48项原样继承，加P11；真实DOM/事件/几何，opaque页面、fake router/sender、mock-IDB |
| 原生浏览器 IndexedDB 驱动 | BLOCKED，exit 2 | `ERR_BLOCKED_BY_ADMINISTRATOR`，应用入口尚未执行 |
| 正常 URL 页面集成 | BLOCKED，exit 2 | 同一管理员导航限制 |
| Chrome MV3 增量 | BLOCKED，exit 2 | `Extensions.loadUnpacked`: Loading of unpacked extensions is disabled by the administrator |
| 真实登录 ChatGPT | NOT_RUN | 明确不在本轮授权范围 |

环境：Linux 6.18.44 x86_64、Node 22.16.0、Python 3.13.5、Playwright 1.57.0、Chromium 144.0.7559.96。原生三档分别尝试一次，记录实际拒绝后停止，未改变策略。它们在最终视图修复前即被阻于模块加载之前，不宣称最终构建执行过原生测试。PR #6 历史 Mac MV3结果不计入本轮。

120主题/604窗口、单主题128成员、长聊天160消息保持；D38验证126近期+1旧项+1未知，未知不混入旧列表。49项DOM覆盖创建/改名/图标/加入/移动/撤销、A/B/unknown、证据撤销/新增重算、草稿/选区/原生节点、流式与交互状态、原生菜单、危险布局退让、损坏视图提示。原生控件仍由宿主持有。冻结、物理IME、读屏、200%缩放、真正浏览器历史、停用/重载清场、PAIA本体没有通过声明。

最终Node原始输出23149字节；最终DOM结果17251字节。完整结果、每项预期/实际、运行时间、失败原件、原生拒绝消息和退出码均在 `b23-final-2026-10-11/raw-parts/` 的无损编码中；运行 `decode-evidence.py --out /tmp/b23-evidence-new` 可恢复并核验SHA256。不是手工摘要替代日志。`SOURCE_AND_RUNS.json` 绑定代码提交、4项变更blob与DOM bundle SHA256。

## B2/B3 覆盖矩阵

| 能力 | 已实现及本轮证据 | 未证明/限制 |
|---|---|---|
| Ref/UserSendEvent、来源、消息与分支 | 严格schema、原始用户新发送、精度、去重与冲突；Node已运行 | 没有真实ChatGPT数据渠道 |
| coverage/新鲜度/撤销/UNKNOWN | 连续覆盖、缺口、source/event撤销，重新投影且人工资产保留 | 合成coverage不证明全账户或其他设备无新消息 |
| 30当地日历日及主题唯一归属 | 时区、DST、当前可靠正事件、旧段覆盖、父主题旧项 | 未做真实宿主时间字段语义核验 |
| Workspace/Placement/显示身份 | 稳定ID、名称/图标/顺序、include/exclude/move、别名/锁、偏好 | 真实磁盘持久化仍待验 |
| 人工优先/并发/幂等/撤销 | scope-wide revision/CAS、operationId、定向inverse拒绝覆盖后来编辑 | 全scope CAS偏保守；真实多tab调度待验 |
| 原生数据保护 | 派生编辑无原生改名/移动/发消息/授权通道；原生DOM状态测试通过 | 合成宿主不等于ChatGPT React实现 |
| 数据库迁移 | 同B1连接、v1→v2增量stores、保留旧Ref、错误schema回滚合同 | 未证明原生IDB升级/浏览器崩溃安全 |
| 损坏与恢复 | checksum+schema、显式damagedHash恢复、journal高水位、旧receipt失效、证据撤权 | 检查点恢复可能损失最新修改，不是无损备份 |

没有另建平行持久数据库。`WorkspaceRepository` 必须接收B1连接；Map只用于临时并发/视图或显式测试替身。普通网页消息不能自行传入scope/actor/INGEST来取得生产证据权。合成provider被限定为测试渠道；不猜官方导出结构，不访问内部历史接口。

## 缺陷、修复与失败记录

本轮恢复时5997ec0已经含有先前中断前提交的：最终异步frame检查、view/recovery的撤权与提交屏障、恢复后不复活来源/操作收据、以有效journal而非损坏revision确定高水位、保留ID防护、当前正事件与未知覆盖裁决，以及MV3驱动事件循环修正。此轮通过完整回归复验，不把旧通过数叠加。历史细节留在 `b23-audit-2026-10-11/`。

**新发现并修复：损坏的视图偏好阻断完好工作空间。** 旧read在校验b23_views失败时中止整个读取，使完好的主题、人工标题无法使用。两个有效反例先失败（corrupt-record / invalid-view），之后最小修复为仅隔离损坏view、返回CORRUPT_VIEW诊断，保留损坏字节，管理界面明确告知；主题/窗口和正常编辑仍可用。状态损坏、事务错误、写入CAS和身份约束不降级。同两项Node反例通过，新增P11在真实Chromium证明原生草稿/节点保留及错误提示。

更早的反例helper误用未标准化的A.key，属于测试驱动错误；保留为view-harness-error，不冒充产品失败。有效view-before、view-after及完整118/49均独立保存。初始116归档是恢复途中的检查点；随后纠正旧zip带入的content-entry文件并完成50文件blob比对后，再跑116；最后视图修复后的118/49才是最终结论。原48项浏览器文件没有重写或删减，新wrapper导入它们。

## 迁移和恢复安全边界

v2升级复用B1数据库；不删库、不靠重新seed恢复，不承诺旧v1代码能打开已升级库。恢复必须确认实际损坏hash及有效checkpoint/journal，只修改当前scope。恢复后的revision高于已验证历史；旧操作不能被重新算作成功或被撤销；来源全部撤权，必须有新证据才恢复活跃推断。

**仍是有损恢复**：可能回到前一检查点，丢失较新人工修改；它不是备份系统。journal或checkpoint也损坏时应拒绝自动恢复。视图损坏此次只隔离和提示，不重建损坏偏好；受损记录原样保留。真实磁盘故障、断电、配额耗尽、跨进程事务/账户变化的所有交错均未实测，不能给出“绝对安全”结论。真实身份resolver仍不存在；同步撤权通知和提交后屏障不等于账户服务与IDB有跨系统原子事务。

## 下一阶段裁决与有限停止

可以把当前代码作为B2/B3的受限工程交付，继续既定B4并发/恢复强化、C1数据驱动体验及合成宿主内的C2；本轮没有实施它们。放行真实持久化应先在允许loopback、IndexedDB与unpacked MV3的隔离Chrome运行 `tests/b23/real-browser.py` 的db/page/mv3三档，并补测新增损坏/撤权案例。长期重新绑定、跨tab刷新通知、规模性能和完整恢复仍需各自验证。

不放行真实ChatGPT C2接管、完整C5/C6或发布。身份、原始发送/分支/导出/覆盖、Project权限、原生功能全链仍需要另获授权的清洁账户验证。

**不必使用个人Mac。** 另一个获准隔离Chrome环境即可补原生验收；若选择Mac，仅需新临时目录/新Profile/合成宿主和测试扩展，不需日常Profile或ChatGPT登录。没有另行授权前不连接Mac。至此完成云端审计、修复、测试、原始证据和架构裁决，保持Draft并停止。
