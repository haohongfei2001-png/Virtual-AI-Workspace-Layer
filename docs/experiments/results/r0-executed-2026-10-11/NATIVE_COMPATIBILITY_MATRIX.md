# R0 原生功能五格与恢复矩阵

**本表不认证真实 ChatGPT 原生功能。** `Cxx` 引用 `chrome-attempt2.json`，`BFxx` 引用其中 `legacy.results`，`Lxx` 引用 `lifecycle-followup.json`。下面的宿主控件都是明确标记的合成 fixture；没有隐藏原生组件后重画一个相似组件来冒充真实 ChatGPT。

五格分别记录入口、操作过程、结果、状态/权限、返回路径。某格没有操作就写未验证，不凭控件存在补齐。真实登录宿主因无清洁账户且公开访问 403，全部保持 BLOCKED。

| 功能 | 入口 | 操作过程 | 结果 | 状态/权限 | 返回路径 | 实际证据与裁决 |
|---|---|---|---|---|---|---|
| 聊天正文/交互回复 | 原 article/input 保留 | 修改交互值，扩展不替换节点 | fixture 值为 91 | 原节点身份不变；真实回复权限未验 | 控件仍在原文档；原生复杂返回未验 | C01/C04；fixture GO，真实 BLOCKED |
| 输入框与选区 | 原 textarea | 自动输入中文合成草稿、设选区；本地 send handler | 合成回显吻合 | 草稿/选区/焦点在计时撤销后保留 | 输入节点保持；真实发送/编辑流程未验 | C02/C07；fixture GO，真实 BLOCKED |
| macOS 物理 IME | 未调用系统输入源 | 没有真实 composition/候选框操作 | NOT_RUN | 自动 fill 不算物理 IME | NOT_RUN | BLOCKED |
| 附件 | 原 file input | 设置内存生成 synthetic.txt | 原 change handler 显示文件名 | 不读用户文件；无上传/额度/安全扫描验证 | 原输入仍可见；取消/上传恢复未验 | C03；局部 LIMITED，真实 BLOCKED |
| 模型菜单 | 原 select | 选择 fixture model B | 值保持 B | 不代表真实模型切换/订阅权限 | 原控件仍在；真实菜单返回未验 | C04；fixture 局部 GO，真实 BLOCKED |
| 工具菜单 | 原 button/dialog | 打开并应用本地选项 | handler 更新 applied 状态并关 dialog | 本地状态保留；无真实工具调用或权限授予 | dialog 关闭后可继续操作原页面 | C04；fixture GO，真实 BLOCKED |
| 流式生成/停止 | 原 start/stop button | 运行本地计时器后停止 | tick 停止增长 | 不是模型网络流或原生动效 | 原控件不被替换；真实中断恢复未验 | C05；LIMITED |
| 原生搜索 | 原 search button/dialog | 搜索不在派生索引中的 T5 | 返回合成 native-only 结果 | 不把已知派生索引冒充全部历史 | 关闭 dialog，继续原页面操作 | C06；fixture GO，真实 BLOCKED |
| 原生新聊天 | fixture 中存在原链接 | C09 是直接文档导航，不是点击该入口 | 新文档可加载 | 不能据此证明真实新聊/临时聊天状态 | 原生完整流程 NOT_RUN | LIMITED，真实 BLOCKED |
| 账户/权限 | 原 account button/dialog | 打开并取消 | 本地 permission 仍 false | 无真实账户、ACL、组织切换或授权 | dialog 关闭；真实切换后返回未验 | C06/BF07/BF16 仅合成；真实 BLOCKED |
| 未知新增入口 | 原 unknown button 未隐藏 | 点击原 handler | 计数增加 | 不用扩展白名单封锁未知按钮 | 原页面继续可操作 | C06；fixture GO，真实 BLOCKED |
| 连续派生侧栏/布局 | 只有 fixture 专用空槽 | 原始最小挂载及独立占位 | 原生主区域没有被移走/覆盖 | 不等于真实完整侧栏布局、重排或 Chrome Side Panel API | 受控撤销移除自己节点 | C01/C16/C17/C23；LIMITED |
| 阅读区唯一返回 | 空槽中的一个四格 hook | 点击自己的 button | 只设置合成 returned 标志 | 保持原生草稿/节点 | 没有实现真正工作区返回、滚动或展开恢复 | C20；hook GO，真实槽位与完整返回 BLOCKED |
| 浏览器前进后退 | 真浏览器 history | SPA pushState 后 Back/Forward | URL 与宿主 state 符合预期 | 原生草稿保持；扩展不重写 history | 真 Back/Forward 可用 | C10；Chrome fixture GO，真实 ChatGPT BLOCKED |
| Canvas/语音/图片/文件库/其他专用页 | 真实入口未读取 | NOT_RUN | NOT_RUN | 不根据文档名单伪造当下功能或权限 | NOT_RUN | BLOCKED，未来按清洁宿主实际存在性验 |
| 原生字体/动画/200%/读屏 | 无真实宿主视图 | NOT_RUN | NOT_RUN | 无视觉/无障碍通过声明 | NOT_RUN | BLOCKED |

## 生命周期必须分开记录

| 操作 | 原生仍可用 | 非敏感挂载清理 | 重新连接 | 结论 |
|---|---|---|---|---|
| 受控 lease 到期 | 草稿、选区、焦点、节点和宿主自己更新的样式保持 | 实际 active-JS 定时清除 | 需新的合法连接机会；不是常驻自动刷新 | C07 GO，仅活跃事件循环 |
| 真实 worker 停止 | 原节点存在 | 200ms 时旧挂载仍在 | 停止事件+内存哨兵丢失+新页面唤醒；IDB 已提交记录保留 | C11/C12：机制 GO，瞬时失效 LIMITED |
| 快速跨文档 | 新文档原生仍可用 | 老文档离开；新挂载未出现 | 被未到期旧 document lease 阻止，无自动重试 | C09 FAIL；正式 handoff NO_GO |
| 原始探针 pushState | 原生仍可用 | 500ms 旧挂载仍在 | 没有该路由观察 | C08 FAIL；原始方案不能直接采用 |
| route 变体 pushState | 原生节点/state 保持 | 14ms/25ms 撤下 | 故意不自动显示新的敏感内容 | C19 GO，仅作为失效信号 |
| 真扩展禁用 | 原生按钮与草稿保持 | 250ms 仍残留，active timer 到期后消失 | re-enable 未自动注入旧页面；显式刷新合成页后恢复 | C14 LIMITED；不是瞬时 clean-layout PASS |
| 裸 CDP 加载后 runtime.reload | 原生草稿保持 | 500ms 有旧 DOM | 扩展变 disabled；刷新页面仍不注入 | C15：该环境配置 FAIL，不推广成浏览器不支持重载 |
| 临时 Profile 开发者模式下 reload | 原生草稿保持 | 仍有旧 DOM | 扩展保持 enabled；显式刷新合成页后恢复 | L01 LIMITED；环境阻塞解释完成，布局残留未解决 |
| freeze/resume | 此次没有形成有效冻结证据 | 不作断言 | CDP 成功响应没有 trusted freeze/resume 事件 | C13 BLOCKED |
| 宿主替换实验空槽 | 原生 island 未重建 | 旧挂载随槽位移除 | 当前最小探针不自动重挂 | C16 LIMITED；生产需有界失效/再绑定 |
| 预留槽被占用 | 原生与既有节点保持 | 拒绝覆盖槽位 | 不强行移除其他 owner | C17 GO，安全缩小控制范围 |

显式刷新仅对合成页面用于确定恢复条件。**它不是生产恢复方案，也不能以它掩盖真实 ChatGPT 草稿损失风险。** 四秒 lease 不是冻结、时钟变化或代码失效下的无条件清理上界。

## PAIA 四臂与顺序

C01/C02 等为 VAIWL 单独运行；C22 为独立 PAIA 占位单独运行；C21/C23 为两者共同运行及反向注册。L02/L03 进一步在真正 DOM MutationObserver 中记录了 **VAIWL→PAIA_PLACEHOLDER** 与 **PAIA_PLACEHOLDER→VAIWL** 两种挂载次序，而不是只根据安装次序推测执行次序。为形成两种顺序，合成占位延迟分别为 600ms 和 0ms。

已验证双方各自退出不移除另一方节点；VAIWL 到期后占位仍在；占位主动退出后 VAIWL 仍在；原生草稿与输入增高后的无覆盖条件保留。没有实际 PAIA 代码、浮球/胶囊/浮板布局、生产 CSS、会员逻辑或日常数据进入实验，因此 **实际 PAIA 共存仍 BLOCKED**。
