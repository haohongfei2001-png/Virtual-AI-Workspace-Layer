# ChatGPT 工作空间重构扩展
## 旗舰级产品设计与技术研究 · 2026-10-10

**交付性质：研究与设计建议，不是已批准 Canonical，不是产品实现或真实账户验收。** 本轮只读取 GitHub 和公开资料；没有修改任何仓库、Issue、PR、开发计划、ChatGPT 对话或账户。配套交互原型完全使用示例数据。

## 0. 结论与设计裁决

建议把产品定义为：**在 ChatGPT 原位工作的、可逆的个人工作空间层**。它帮助用户知道“我在做什么、相关对话在哪里、下一步从哪里继续”，而不是再造一个聊天客户端、文件夹管理器或知识库。

选择“**稳定工作区＋临时工作集＋原生聊天能力区**”：长期事项保持稳定身份；当下并行窗口形成短期工作现场；聊天、模型选择、输入框、附件、Canvas、语音及平台权限继续由 ChatGPT 承担。工作区和聊天标题是独立的本地派生数据，不改原始 Project 归属。真正的原生改名进入另一条有单次授权和操作回执的通道。

旗舰体验应当把复杂度藏在数据与适配层，而不是增加图谱、无限目录、几十个标签和一堆 AI 按钮。用户日常主要做三件事：打开工作、继续聊天、偶尔纠正。组织只是副产品。

三项前提需要纠正：

1. **聚合显示不等于合并模型上下文。** 三个 Project 来源在同一工作区里出现，不代表文件、指令、权限和项目记忆成为同一个上下文。新建对话必须另行明确实际原生目的地。
2. **浏览器扩展不等于全账户读取权限。** 能访问当前页面，不意味着能列出、读取和合法自动抓取全部历史；“仅用户输入”也不能自动解决条款问题。
3. **派生数据不等于可丢弃缓存。** 用户改过的标题、归属、系列关系和工作现场是新产生的用户资产，必须可备份、恢复、迁移和审计。

第一项是产品语义底线，第二项是公开发布的可行性门槛，第三项决定产品是否值得长期依赖。

## 1. 研究方法与证据边界

核对了五个仓库的远端 main，读取了相关状态、设计和代表性源文件，检查开放 PR。所有代码结论绑定下表 SHA，而不是依赖旧聊天记忆。公开研究以 Chrome Web Store 产品页、开发者官网、OpenAI 与 Chrome 官方文档为主。

**证据分层：**

- **已核实事实**：本轮实际读取的源代码、仓库状态和官方能力文档。
- **供应商声明**：扩展商店和产品官网描述。可以证明产品公开提供或宣称某能力，不能代替实际质量、隐私或可靠性测试。
- **本轮设计**：本文提出的交互、算法、架构与成功标准。
- **待验证能力**：真实登录态适配、完整账户隔离、历史导出覆盖度、AI 质量、原生批量改名和异常恢复。

本轮没有安装并登录测试所有竞品，也没有在用户的真实 ChatGPT 账户上进行自动化测试。没有对五个仓库执行完整构建、回归或实时 UI 验收。不能把本轮研究写成这些功能已经可靠运行。

### 1.1 GitHub 实际快照

| 仓库 | 本轮读取的 main | 当前证据及开放 PR |
|---|---|---|
| adaptive-contextual-sidebar | `7495158e9d3e3b383feafe00cea810e8954cac82` | ACS-00 能力试验；账户范围、完整 MV3 生命周期、路由与正文归属仍有未验收项。开放 PR 查询没有结果。[G1][G2] |
| context-tabs | `8ccdd75255e37bb4a2ff92da427a7be86c6192f7` | CT-01 功能核心完成；CT-02 查找排序 READY；分组、别名、ChatGPT 线程适配在后续阶段。开放 PR 查询没有结果。[G4] |
| chat-title-manager | `44d5a4e3f2369e7debaed23cdabb2b2dbe1ebab7` | main 为初始提交；实际候选实现在 Draft PR #1，head `3222066812e08aa75119247de5ec5968e3bfbaeb`。原生登录态改名尚未认证。[G6] |
| paia | `6b4f96199e4f2de4040b1ed505a3610186b6815e` | manifest 为 0.43.4；STATUS 指向全 owner Search source preflight，既有多条产品线继续，完整同步、真实 AI 质量/付费、安装和 live-host 验收不能视为完成。开放 PR 包括 #231、#188、#187、#182、#179、#178、#140、#132、#99、#91。[G8][G9] |
| hcl-assistant | `b083ac25e22176a58eb048068b90ceb485800c8c` | Assistant-first / Continuum；当前普通会员与支付工作尚未完整商业验收。开放 #55 为视觉候选，#53 为隔离合成验收候选，不能当作主线已采用功能。[G12][G13] |

PAIA 的开放 PR 并非十条都在活跃实施：有旧候选、堆叠分支、未采用设计和与新 main 重叠的历史工作。应从当前 STATUS 和具体源文件判断，不用“开放 PR 数量”计算开发进度。其 extension README 的旧版本说明也不能覆盖 manifest 与最新 STATUS。

### 1.2 读代码后值得继承的真实资产

**ACS：**存在原生列表留在原位、旁边挂载派生视图的试验；有 tab/route/epoch、挂载身份以及限时隐藏租约等恢复思路。但当前 STATUS 明确没有完整账户隔离和 disable/re-enable 证明。旧设计“没有可见 Workspace、只改普通侧栏”与本产品目标冲突，应继承机制，不继承范围限制。[G1][G2][G3]

**Context Tabs：**当前 sidepanel 能枚举窗口标签页、激活/关闭、在相邻位置新建，监听创建、删除、移动、激活、更新等事件并合并刷新。适合复用浏览器标签页事件模型、窗口身份和去重，不适合把整个浏览器管理后台搬进 ChatGPT。[G4][G5]

**Chat Title Manager：**候选代码有实体/任务规则、明确前序线索、版本整数元组、可见基线和人工修改保护的思路。它是少数预定义对象与关键词规则，不是已经泛化的语义命名引擎。不能直接保留“开发经理”等助手角色式标题、把可见最大版本当全历史最大值，或把关键词分数当准确率。[G6][G7]

**PAIA：**可借鉴不可变来源、用户编辑优先、版本/撤销、原生页面适配、输入身份和导入恢复等工程经验。当前 MAIN-world response observer 是既有请求的被动旁路，源代码出现内部响应路径的识别；这不是官方历史 API，也不是主动全量同步的证据。其网络响应和页面桥接数据仍需视为不可信，不能照搬成新产品的全账户读取通道。[G8][G10][G11]

**HCL：**继承“聊天唯一中心、依据按需展开、不要把内部运行状态变成前台导航”和更正的语义，不继承另一个聊天引擎、认知画像、研究实验室或供应商后端。[G12][G13]

## 2. 竞品：基础整理已经不是空白市场

“ChatGPT Organizer”不是唯一产品名。本轮分别核对了 Smart Auto Folders / MarkBook 和 Organizer & Workspace，避免把同名产品的特征拼在一起。

| 产品 | 已公开提供或宣称的能力 | 对新产品的约束 |
|---|---|---|
| ChatGPT 原生 Projects、搜索、Space | Projects 承担聊天/文件/指令与上下文；搜索不只是标题，也覆盖消息等对象；Space 管页面和文件，并与 Projects 分开。[S1][S2][S3] | 不应以“原生只能按标题找聊天”“原生完全没有工作空间”为卖点。保留这些入口和真实语义。 |
| AI Toolbox | 多平台、目录/子目录、同一聊天多处加入、搜索、提示词、书签、同步等；并非只能额外建一个文件夹。[S7][S8] | 跨来源引用、多重归属本身不独特。其同步元数据也属于隐私范围，不能将 local-first 解读为零外传。 |
| Superpower ChatGPT | 文件夹及子文件夹、全文检索、分支树、提示词、批量管理、消息收藏等广泛工具。[S9] | 功能数量很难成为优势；应在稳定、低干扰、重新进入工作和可恢复上证明优越。 |
| Organizer / MarkBook | 自动文件夹、书签、ChatGPT/Gemini 整理与搜索；2026-08-22 更新的 2.1.1 商店页面明确宣称自动整理。[S10] | “AI 自动分类”不是空白；是否真正理解长程事项和纠错稳定性需要实测。 |
| Organizer & Workspace / AI Workspace Pro | 工作区、标签、笔记、树形对话、提示词链、本地搜索以及本地存储等声明。[S11] | “Workspace”这个名称和“完整工具侧栏”不能构成差异。安全/性能声明未独立验收。 |
| Sortbase | 多平台共同工作空间、文件夹、搜索、提示词库与对话转移。[S12] | 跨平台不宜成为本产品首要扩张方向；先解决 ChatGPT 原位深度工作，避免立刻做四套适配。 |

供应商比较页常把对手旧版本当成现状。本文优先使用各自产品页和商店声明，不采用“对手没有某功能”这类未经安装核实的绝对判断。Easy Folders 的当前品牌关系未在本轮获取到充分的一方证据，不把第三方关于其更名的说法当作正式结论。

### 2.1 真正需要争取的差异

不是“更漂亮的文件夹”，而是以下闭环能否同时成立：

**理解同一个长期事项 → 提供稳定而简短的名字 → 找到正确的系列/片段 → 恢复当时的并行现场 → 继续在原生 ChatGPT 工作 → 纠错后不再反复打扰。**

本轮未发现已核实资料能证明某个竞品完整实现了这套组合；这不等于证明市场上不存在。应通过相同真实任务的盲测验证差异，而不是先宣称全球首创。

## 3. 用户问题重新定义

大量聊天并非只有“找不到”一种问题。至少包含：

- **身份混乱**：相同事项横跨原生项目、普通聊天和不同阶段，名字不能区分。
- **工作断裂**：找到了某个聊天，仍不知道它是否最新、该看哪个前序、还有哪些并行窗口。
- **错误合并风险**：界面统一后，用户误以为指令、文件、记忆、分享权限也统一。
- **维护成本转移**：AI 先生成复杂分类，再要求用户持续审批、改目录、清收件箱，实际没有省力。

北极星指标不是“自动整理了多少条”，而是**重新进入正确工作所需的时间与错误率**。次指标是每周纠错时间、上下文边界误判次数、无新证据的组织漂移、恢复成功率和使用原生功能的干扰率。

产品不做：输入档案编辑、思想提炼、跨 AI 的个人 Context 输出、提示词库复制品、心理画像、独立模型聊天、多站点浏览器管理、偷偷转存原生 Project 文件。它们会侵入 PAIA/HCL 或显著扩大风险面。

## 4. 信息架构：稳定组织与动态关联分开

### 4.1 四个用户可理解的对象

| 对象 | 含义 | 展示规则 |
|---|---|---|
| 工作区 | 一个长期事项，如 PAIA、硕士论文、秋招 | 身份稳定，不因新模型重新聚类而换名字、拆分或消失。只在有持续价值时形成。 |
| 对话 | 原生 conversation 的引用 | 一个原生对话只有一个身份，可以在多个派生工作区显示；不是复制聊天。 |
| 对话系列 | 确有接续关系的一组对话 | 例如 PAIA 开发 1.0→1.1→1.2；必须区别接续、分支、相似主题。 |
| 当前工作集 | 眼下需要一起打开的少量对话 | 以标签条或紧凑列表表现；跨工作区可存在；不要求持久分类。 |

开发、设计、构想是工作区内部的**可选分面**，不是无限递归目录。数量少或证据不足时直接用列表，不制造三个空分组。常用分面上限建议 3–5 个，更多放入搜索筛选；这是初始设计假设，应用可用性验证调整，而非永久硬限制。

“相关对话”不是第五套目录，而是当前对话旁的临时建议，默认不常驻：优先显示明确前序、真实共同任务、用户经常联用的 3–5 项。不能因为 A 相关 B、B 相关 C，就把 C 强行加入 A 的工作区。

### 4.2 一个对话能属于多个工作区，但不能失去真实来源

PAIA 的例子可以呈现为：

> PAIA
> 
> 开发：开发 1.0〔普通聊天〕、开发 1.1〔原生项目：paia 开发〕
> 
> 设计：输入板交互〔原生项目：paia 开发〕
> 
> 构想：产品构想〔原生项目：产品想法〕

来源徽标在对话页持续可查，工作区概览低权重显示“来自 3 个原生来源”。在详情中明确“只改变显示，不合并上下文”。共享和企业来源的标记不可隐藏。

不要用全屏警告反复教育用户；只有第一次、实际目的地改变或高风险分享/写入前出现解释。

### 4.3 更好的补充：对话内的片段锚点

多主题长对话不能靠一个完美标题解决。保留一个稳定主标题，在搜索和“相关内容”里直接指向其中一个已识别片段。例如“PAIA 产品构想 · 第 18 条用户输入”。这比把原生对话强行拆分、复制或频繁重命名更好。

片段锚点优先使用经过验证的消息/分支标识；只有可见文本时使用局部文本指纹与位置。未加载或不唯一时退回打开原生对话并说明需原生查找，不能承诺任意历史片段都能精确跳转。

## 5. 页面与视觉设计

### 5.1 页面骨架

默认保留两列：左侧工作导航，中央当前对话或工作区概览。不默认增加右侧永久 Inspector。

左侧包含新对话、搜索、当前工作集、少量常用工作区；底部保留原生功能入口、派生/原生切换和设置。原生 Projects、Space、GPTs、插件、账户等随账户实际存在的入口可通过“ChatGPT 功能”访问，不能只留下研究者熟悉的旧功能。

当用户已经在对话中，启动扩展不跳到仪表盘、不改变路由、不丢失输入焦点。工作区概览是用户主动选择时出现的导航页，不是强制首页。普通新对话仍优先显示原生输入区。

### 5.2 工作区概览

标题如“PAIA”，一行简短范围说明；主要动作是“继续上次工作”。下方是当前系列、最近活跃对话和可选分面。卡片只用于少量继续入口与工作区；大量对话用密集单行列表，不把数千条聊天变成卡片墙。

列表通常显示短标题、最少的区分信息、最近活动。默认不显示 token 数、AI 分数、长摘要或全部标签。用户手动固定的顺序不被自动热度刷新破坏。

### 5.3 对话页

顶部显示“工作区 / 短标题”和真实原生来源；上下文相关建议藏在一个入口内。标题编辑与系列入口可通过 hover、键盘焦点、触屏菜单发现。

中央保留原生 transcript 和 composer 的 DOM 所有权，不能复制一份假聊天覆盖上去。回复中的新型互动内容、附件和工具控件不进入自制渲染器。空间不足时首先收起派生导航，不压缩输入区或遮盖语音/工具状态。

### 5.4 视觉与可访问性

采用中性浅色阅读面、轻量边界、少量强调色；跟随原生主题和系统减少动态偏好。毛玻璃仅用于导航边缘或短暂浮层，不让正文、菜单文字和来源徽标低对比。设计密度提供舒适/紧凑，不增加复杂主题商城。

设计目标：键盘可完成搜索、打开、改名、归属、撤销、恢复原生；屏幕阅读器读出来源和当前选中状态；200% 缩放不遮挡原生输入；拖动有等效按钮；减少动态时无信息缺失。普通正文对比度目标 4.5:1，视觉验收需实际测量。

## 6. 完整交互流程

### 6.1 首次安装

先呈现可用的本地导航，不强制购买、登录模型服务或上传历史。解释当前只能处理什么；页面访问、持久内容索引、云端 AI、原生写入分开授权。

权限范围以 chatgpt.com 为主。用户可以先只使用标题与引用。第一次整理显示少量代表性样本，允许改两个例子后再应用同批规则，不要求逐条审批上千聊天。

若当前账户身份未能确认，不把旧账号的工作区和标题投射进页面。可提供隔离的演示或临时导航，但不能把“用户选择本地资料库”伪装成自动认证的账户身份。

### 6.2 大量旧聊天的一次性整理

提供三条清楚的路径：“先整理已知聊天”“导入官方导出”“继续使用时逐步补全”。不默认后台翻页、打开数百隐藏标签页或请求内部接口。

导入先在本地解析，报告账户范围、已识别条数、未知字段、重复、分支和正文覆盖情况；然后预览拟形成的工作区和标题。整批派生变更是一个可撤销事务。预览是迁入时的校验，不是一个以后每天都要清理的“AI 候选审批中心”。

导出的用户文本可用于索引，但它不是原生聊天恢复接口。原生已删除或权限变化的聊天，不因为本地有快照就假装仍可打开。

### 6.3 新对话归类

点击 PAIA 中的“新对话”时，按钮明确显示实际目的地，如“普通聊天”或“原生项目：paia 开发”。首次选择后可以记住该工作区的默认新建目的地，但必须可见且可改，不改变已有对话的 Project。

用户完成发送、获得稳定对话身份后才生成候选归属和名称。不读取未发送草稿作为默认持久证据；不在 IME 输入中途抓取、重排或抢焦点。高置信度派生自动应用，中等置信度进入可按需查看的相关建议，低置信度保持原样。不会弹窗问“这条应属于什么”。

### 6.4 原生/派生切换

切换不导航、不重发、不清空草稿；只撤除自有导航与呈现属性。原生数据立即作为真实来源继续工作。仅派生别名消失；曾经经单独授权完成的原生改名不会自动恢复，界面须清楚区别这两件事。

### 6.5 搜索

一处入口同时检索工作区、派生标题、原生标题、历史别名、已授权且已索引的用户输入，以及已知片段。排名先考虑当前工作，再考虑全局，但提供“全部”逃生口。

结果显示来源与覆盖度，不能将未找到等同不存在。提供“在 ChatGPT 原生搜索中继续查找”，保留原生搜索键位；扩展默认使用不冲突、可自定义的快捷键。对未读取的消息不生成似是而非的摘要。

### 6.6 拖动与人工纠错

把聊天拖到工作区，默认是“也在这里显示”，不是移动原生 Project。需要只改变派生归属时，明确选择“只在这里显示”。菜单等效操作包括属于这里、不属于这里、同时显示、恢复自动。

负向纠错是持久约束。AI 不得下一次又把该聊天放回来。一次纠错不自动泛化到全部同名实体；用户可以明确选择“今后同系列也这样处理”。

### 6.7 多标签页与工作现场

同一个 conversation 在多个浏览器标签页出现，数据实体仍只有一个，tab 实例有多个。单击通常聚焦已有匹配标签页，修饰键明确新开；不会为了点击工作区恢复按钮创建重复窗口。

工作现场保存对话引用、当前项、固定顺序、已验证的阅读锚点和必要的窗口关系，不默认保存原生输入草稿、生成中的回答或 AI 内部执行状态。

恢复时先恢复可见工作集并激活当前项，其余惰性打开或逐个打开；对已存在标签页去重。不能声称恢复了模型上下文、已经失效的权限或仍在运行的 Agent。恢复失败项保留在清单里，不偷偷删掉。

### 6.8 故障、离线和升级

网络失败不影响本地标题、工作区和搜索；云端模型失败不清空已有组织。页面适配不匹配时停止增强，显示原生路径，不让页面空白等待“AI 修复”。

扩展内的原生切换是受控同步撤销；浏览器层面禁用/卸载不保证会再执行清理 JS。完整干净恢复以原生页面刷新为可靠逃生路径，但**不能自动刷新有草稿或生成任务的页面**。限时 CSS 隐藏租约可以缩短异常遮挡，必须经过冻结、后台节流和减少动态等实机测试，不能当成已解决。[G3][S14]

### 6.9 分享与原生权限

派生工作区默认是个人的。别人打开原生共享链接不会看到你的派生别名或工作区，也不会因你整理了一个跨 Project 工作区而得到其他来源权限。

未来分享派生清单只能分享经过逐项确认的链接与可共享元数据，不能继承“同工作区”就自动公开。共享链接可能是快照，也可能受托管空间规则约束；用户可访问一个分享页不意味着拥有该对话。[S6]

## 7. 智能命名：稳定身份高于即时摘要

### 7.1 标题结构

建议内部结构为：`对象 + 任务 + 必要限定 + 可选系列序号`。例如：

| 原生标题或情形 | 建议全局显示 | 工作区内显示 |
|---|---|---|
| “关于 PAIA 后续开发、技术架构与实现方案的讨论” | PAIA 开发 1.0（仅在系列证据成立时） | 开发 1.0 |
| “继续优化 PAIA 的浏览器提示词弹窗交互” | PAIA 输入板交互 | 输入板交互 |
| 产品想法项目内的 PAIA 讨论 | PAIA 产品构想 | 产品构想 |
| 两个同名设计线程 | PAIA 思想库设计 / PAIA 输入板设计 | 思想库设计 / 输入板设计 |
| 同一个聊天中临时讨论了面试 | 主标题保持稳定；面试作为片段检索入口 | 不因一次插曲改名 |

短不是机械字数裁切。建议主要标题 6–18 个汉字等效宽度，必要时允许更长；混合英文缩写、数学符号和人名按视觉宽度处理。不要翻译已稳定的产品名，不把用户所有聊天强塞进“对象＋开发经理”模板。

### 7.2 必须保留的三层名字

- `nativeTitle`：最近一次有来源证据的原生标题，不由派生算法覆盖。
- `displayTitle`：派生显示名，带 owner（human/ai/rule）、revision、证据和生成版本。
- `aliases`：旧显示名与稳定检索别名，避免改名后搜不到。

未知来源的原生标题不能假定由 AI 生成。首次导入把原名当作需要保护的事实；用户选择“让扩展建议显示名”后可以加派生名，但真正原生改名仍另批。用户编辑过的显示名锁定，AI 只能提议，不自动覆盖。原生页面中观察到外部改名时，更新来源观察并暂停该对象的原生自动化，不能猜测是用户还是平台改的。

### 7.3 系列与版本

对话序号、产品发布版本、文档版本必须是不同字段。“讨论 PAIA v0.43.4”不意味着聊天序号是 0.43.4。

系列接续证据优先级为：用户明确连接前序 > 真实已确认分支/接续关系 > 已确认系列中的明确继续指令 > 纯主题相似。最后一项只能提出关联，不能自动发序号。

版本使用整数元组；1.9 的下一项为 1.10，不是 2.0 或 1.91。对从未见过的旧聊天不发新序号。多标签创建通过本地事务分配；未来多设备同步需要唯一分配或冲突保留，离线状态不能保证全局顺序时暂不自动编号。删掉历史项不重排后续编号，避免引用断裂。[G7]

### 7.4 命名生命周期

初始原名 → 有稳定发送证据后得到建议 → 固化显示身份 → 后续只增补片段与别名。只有真正发生主任务迁移、用户明确改名或同名冲突时才提议修订。

生成期间、拖动期间、用户正寻找某一行时，不更新标题和排序。主题演化先调整相关片段，再考虑主标题；不把“最新一句话”当整个聊天的主题。

## 8. 自动组织与命名的算法方案

### 8.1 输入与证据预算

每条对话构造可追溯证据包：来源类型、范围身份、原名、已知原生 Project、首个明确任务、后续明确目标/纠正、用户指出的前序、最近与主任务有关的输入，以及内容覆盖状态。

默认不读取助手输出、附件正文、Project 文件和未发送草稿作为索引内容。仅看用户输入会失去一些省略指代信息；算法因此允许未知，而不是用模型补出缺失事实。将来若研究可选助手输出，需要独立必要性和授权，不能默默扩大范围。

去掉重复长模板、代码中仅被引用的无关实体和引文中的命令歧义，但保留原始证据指针。每次采样有预算，记录截断范围。不能将“首尾各几条”包装为完整理解。

### 8.2 稀疏候选生成

先以词法索引、明确实体别名、系列关系、已知手工归属产生少量候选，再按需用多语言 embedding 召回。避免每次新消息对全部历史做两两 LLM 比较。

初始设计可采用 top-20 候选重排，数量由召回与性能实验决定。工作区实体、对话任务、原生项目与短期联用分别建特征，不能混成一个相似度。

原生 Project 名称只作为弱先验。某对话放在“产品想法”里并不意味着它不是 PAIA。时间接近、同时打开仅用于工作集或弱相关排序，不能作为自动合并长期工作区的强证据。

### 8.3 决策层

候选评分包含：显式实体证据、任务一致性、确认的接续关系、用户约束、来源先验、短期联用。各项权重通过标注集学习或校准，不在设计阶段编出一个“科学准确”的固定配方。

以分层决策取代一次自由聚类：

1. 先执行硬约束：账户、权限、人工 include/exclude、标题锁、已确认系列。
2. 再判断事项身份是否相同。
3. 再判断任务分面及接续/分支/仅相似。
4. 最后决定自动加入、只推荐或保持未知。

LLM 输出受限结构：候选工作区 ID、分面、标题候选、证据引用、歧义原因；不得输出可执行代码、任意 URL、工具调用或新权限。引用必须指向本次提供的真实证据。模型自报 confidence 不能直接作为自动操作阈值。

### 8.4 稳定性机制

新结果进入派生候选，再由 reducer 检查当前 revision 和人工约束。模型运行途中用户改名或切换账户，旧结果作废，不以完成时间覆盖新操作。

长期工作区采用迟滞：加入门槛高于展示相关建议的门槛；已经稳定的人工/确认关系不会因一次低分自动移除。大规模拆分、合并、改名必须预览。模型升级先影子评估，不重写用户现有组织。

系统解释“为什么在这里”时展示记录过的依据，例如“前 3 条输入明确讨论 PAIA；你已将同系列指定为开发”，不现场编一段解释来替算法辩护。

### 8.5 中文与个性化

匹配侧做 Unicode 规范化、繁简/英文别名策略和中文分词/字符 n-gram；展示侧保留用户原始用字。个人产品名称、缩写和专有术语先从用户确认中建立，而不是把开发者本人 PAIA/PJSDAS/HCL 的词典写死给所有用户。

允许不同用户对同一事项采用不同划分。个性化以明确纠错为强信号；仅访问某聊天多次不等于认可其工作区归属。

## 9. AI、自动化和 Agent 的分工与成本

| 手段 | 最适合 | 主要代价与限制 | 建议 |
|---|---|---|---|
| 本地规则与词法检索 | 明确产品名、历史别名、系列、同名检测、权限/版本检查 | 对省略与多主题泛化有限 | 始终可用的底座 |
| 本地 embedding / 小模型 | 语义召回、粗分面、中文近义表达 | 模型下载、内存、耗电、设备差异、中文质量 | 可选增强；必须设备与语料验证 |
| 云端 LLM | 歧义消解、多主题命名、首次批量整理中的困难项 | 内容外传、成本、延迟、供应商保留政策与限流 | 只处理必要证据包，单独同意与预算 |
| 确定性页面自动化 | 用户已批准的具体原生改名 | DOM 漂移、焦点/路由变化、并发编辑、未知结果 | 独立受限执行器 |
| 通用 Agent | 辅助分析兼容错误、提出操作计划 | 越权、误点击、不可重复、难以审计 | 不做默认运行依赖，不给予自由改名/移动权限 |

Chrome Prompt API 是可研究候选，但本轮官方文档列出的语言是 en、ja、es、de、fr，不能把它承诺成已支持中文的默认本地命名引擎。其设备条件也需要运行时探测。浏览器内中文模型可另测 ONNX Runtime Web 的 WASM/WebGPU 路径，但运行时支持不等于选定模型质量达标。[S18][S19]

**新的官方机会：**Sign in with ChatGPT 已有身份与部分计划用量集成路径，OSS/本地应用与商业应用的适用条件不同。可研究它来降低用户填 API 的负担，但商业接入/Chrome 形态资格、scope 与额度须验证；它明确不授予 ChatGPT 历史会话读取权。登录认证也不能直接证明某个已打开网页当前正在使用同一账户。[S20][S21]

### 9.1 成本模型，而不是虚构报价

先计算 token，再代入实际签约价格：

`C = 输入 token / 1,000,000 × 输入单价 + 输出 token / 1,000,000 × 输出单价 + embedding + 重试 + 网关/存储/支付/支持成本`。

纯示例：1,000 条对话，每条传 800 输入 token、返回 60 token，总计 0.8M 输入与 0.06M 输出。**假设**价格分别为每百万 token 1 元、5 元，单轮模型费用为 1.10 元；这是算术示例，不是任何供应商报价或真实产品成本预测。若传入完整长对话、反复聚类或使用大型推理模型，预算会改变数量级。

应记录每个 evidence hash/model/schema 的结果缓存，仅重算改变的部分；设置批次上限、每日上限、月度上限和重试上限。用户点击预览不应每次偷偷收费。失败重试按请求结果区分，不能在结果未知时重复消耗。

本地向量也非零成本：10,000 条 × 384 维 × float32，仅原始向量约 15.36 MB，尚不含索引、元数据和模型。完整模型内存往往更大，必须单独预算，不能把“本地免费”当“无成本”。

## 10. 历史数据到底能拿到多少

| 来源 | 技术上可确定的边界 | 产品处理 |
|---|---|---|
| 当前页面已渲染标题/链接 | 扩展 content script 可以读取获准页面 DOM；只能证明当前可观察内容。[S13] | 建立引用，不自动声称已读正文。 |
| 当前对话已渲染用户消息 | 须验证角色、对话/分支、路由与渲染所有权；虚拟化和折叠会造成缺口 | 标部分覆盖；不知道的保持未知。 |
| 尚未打开的历史聊天 | 安装扩展不等于获知完整列表或正文 | 标未知，不承诺后台自动补齐。 |
| 原生 Projects 内聊天 | 获准页面/导出里见到的来源才可索引；标题或 URL 不能推断完整指令/文件范围 | 保留原生来源与权限；未知 Project 明示未知。 |
| 官方导出 | 用户主动提供的账户数据；实际格式、分支和 Project 字段须用样本验证；不保证永远固定 schema。[S4] | 本地导入、格式版本化、错误报告、重复去重。 |
| 原生搜索结果 | 用户打开的结果可以形成观察证据 | 作为补全路径，不把搜索 UI 当批量爬虫接口。 |
| 页面已发出的网络响应 | 技术上可被适配器观察，但可能包含超出所需的内容，也受条款与格式变化约束 | 不作默认全量读取方案；单列安全、条款、实际必要性实验。 |
| 共享链接 | 只能使用当前允许看到的共享内容；个人快照与托管空间链接规则不同。[S6] | 另设 shared-reference 类型，不等同用户自有 conversation。 |
| 临时聊天 | 原生有独立的历史/记忆/保存规则。[S5] | 默认不持久索引、不云处理、不加入长期工作区；保存为普通聊天后重新判断。 |
| 另一个账户/组织 | 同一浏览器可切换账户，原生数据保持分离。[S22] | 不跨账户聚合；不同原生组织空间默认隔离。 |
| OpenAI API Conversations | 文档服务于 API 应用会话，不是个人网页历史列表接口。[S23] | 不使用 API key 冒充获取 ChatGPT 网页历史的授权。 |

官方导出当前并非所有工作区都有相同的自助能力：普通个人计划和合资格 Edu 有相应路径，Business、Enterprise、Healthcare 不能假设都有个人式导出入口。导出可能需要等待且下载链接有限期，不能作为安装后的即时后台依赖。[S4]

### 10.1 覆盖度模型

按对象记录 `reference_only / title_only / partial_user_text / snapshot_verified / stale_or_unavailable`，另记录观察渠道、时间、分支、缺失区间与解析状态。“快照完整”只对该份已验证快照成立，不等于账户永久全量。

界面说“已知 320 条，其中 210 条具有用户输入索引”；若账户总量未知，不显示“已整理 100%”或“你共有 320 条”。批次进度只对已知批次分母计算。

导入时校验 ZIP 解压限制、路径、大小、重复 ID 与编码；导入是数据，不执行 HTML/script，也不把聊天里的指令当系统提示。解析失败保留原始文件由用户控制，已成功部分需可单独回滚。

## 11. 平台条款、权限与公开发布

OpenAI 当前条款对自动/程序化提取数据等行为有限制，也涉及服务修改与规避保护。Chrome 的页面权限、用户同意、公开源代码或竞品上架，都不能替代平台的许可解释。**不能保证“只读用户输入”或“仅 DOM 操作”就必然符合条款。**这需要在真实分发模式、地区、账户类型和数据流程下做专项审查，必要时取得书面澄清。[S24]

因此把产品能力拆成可独立运行的层：本地引用/别名与用户提供的导出；经过审查的增量观察；独立授权的云推理；受限原生写入。某条读取路线不成立，不应迫使整个导航产品依赖违规替代路线。

Chrome Web Store 同样要求处理用户数据的产品提供隐私政策与安全处理。内容、标题、工作区名字、相关关系、embedding 和操作日志都可能敏感；“不保存正文”不代表无隐私数据。[S17]

企业 Project、客户资料、合同或第三方个人信息，用户能在 ChatGPT 查看不等于可以传给扩展的云供应商。托管账户默认禁用云推理和跨域同步，管理员策略优先。

## 12. 完整网页重构：方案比较与选择

| 方案 | 体验上限 | 主要风险 | 结论 |
|---|---|---|---|
| 零散 DOM 增强 | 小按钮、标签、标题装饰容易切入 | 容易堆积；导航仍旧混乱 | 只用于局部能力，不作为整体产品架构 |
| 替换导航区＋派生工作区视图＋原生聊天区 | 能显著改变使用结构，又保留核心原生功能 | 仍依赖 DOM 契约；需要持续兼容与恢复 | **主架构** |
| 完整克隆 ChatGPT 前端 | 表面控制最强 | 没有完整官方网页会话协议；需重做流式、工具、附件、Canvas、语音、权限；高度漂移 | 不选择 |
| 独立网页/扩展管理后台 | 数据和渲染容易控制 | 用户不断离开 ChatGPT；点击和工作割裂 | 只作导入、恢复、可信授权等低频辅助页 |
| 外壳中 iframe 嵌入完整 ChatGPT | 看似简单 | 受嵌入安全策略、认证和导航限制；没有证据支持可靠可用 | 不作产品依赖，不绕过平台防护 |
| 独立浏览器/桌面客户端 | 对窗口与工具有更多控制 | 维护范围、分发、账户信任和迁移成本变大 | 不是当前 Chrome 产品的前置路径 |

“完整重构”应理解为**用户任务、导航和信息架构完整重构，而不是每个 DOM 节点都必须自己渲染**。保留核心原生区不是降低设计上限，而是保留平台不断演进能力的正确技术边界。

### 12.1 组件与数据流

```text
ChatGPT 原生 DOM / 用户选择的导出
                  ↓（受许可和范围约束）
Host Adapter → Observation Validator → Scope Gate
                  ↓
          Repository / IndexedDB
          ↙         ↓          ↘
  Lexical Index   Intent Log   Evidence Pack
       ↓             ↓            ↓
   Search       Projection Reducer ← AI Suggestion
       ↘             ↓
        Derived Shell / Workset / Display Titles

独立通道：Trusted Review → Native Write Plan → Scoped DOM Executor → Receipt
```

适配层只报告经过验证的事实：路由、native conversation ID、观察到的标题、来源徽标、可见用户输入、可操作控件及能力状态。业务层不直接写 CSS selector，模型也不持有 DOM 操作权。

### 12.2 原生 DOM 所有权

不移动或克隆 React 所有的 transcript/composer 节点，不读私有 React store，不接管原生消息发送。自有 Shadow DOM 用来隔离样式，不是安全边界；页面与 content script 共享 DOM，不能认为页面完全无法干预你的 UI。[S13]

原生导航容器只添加可撤销的自有属性/规则，避免恢复整个旧 style 字符串覆盖 ChatGPT 同时做出的布局更新。保护原生对话区、菜单 portal、弹窗和读屏结构；隐藏的原生导航不应该还留在键盘焦点序列。

### 12.2a 导航、历史与适配协议

派生 UI 不伪造 ChatGPT 原生路由。点击已知对话时，优先使用当前页面已验证的原生链接/导航入口；否则通过已验证同源 URL 普通导航，保留浏览器后退/前进。工作区概览的开合是扩展自己的视图状态，不覆盖原生 history.state，也不偷偷添加与 ChatGPT 路由含义冲突的路径。支持 modifier-click、中键新开和链接复制；“聚焦已有标签页”仅在目标账户、原生空间与 conversation 身份都已核对时使用。

适配器输出版本化能力集合，而非一个笼统的 supported=true：例如 observeConversation、observeUserMessages、mountNavigation、openNativeProject、renameNativeTitle。每项各自返回 verified / unavailable / ambiguous 和证据；某个新页面不支持改名，不意味着连只读导航都必须停用。语义 DOM、可访问名称、经回归验证的属性与结构约束共同识别目标；CSS class 只作弱线索。每个危险动作必须匹配唯一对象，不能“找到第一个相似按钮就点击”。

原生站点的新 UI 变体在隔离 fixture 和获准登录态中验证后才启用相应能力；云端只能下发预定义能力关闭状态，不能即时创造新的执行路径。浏览器冻结、页面重建、导航竞争和旧文档延迟回包都需使旧挂载/执行令牌失效。

### 12.3 MV3 与存储

Service worker 负责范围、持久命令、索引任务调度和消息验证，不依赖常驻全局变量。Chrome 会在空闲或其他条件下终止 worker，必须允许重启后恢复批次，而不是用无限心跳维持生命。[S14]

正式数据由扩展 origin 的 IndexedDB 持有。content script 直接调用网页 Web Storage/IndexedDB 得到的是宿主 origin，不可把隐私资料库放在那里。`chrome.storage` 用于小设置/状态并限制向 content script 暴露；全文、向量、日志不塞进 sync。[S15][S16]

耗时索引在有生命周期管理的 worker/扩展页面中执行；确需 offscreen 时符合 API 的用途和权限，不把它当任意永久后台进程。导入和推理按块提交并可续传，资源不足时暂停，而非卡住原生输入。[S26]

### 12.4 权限最小化

基础考虑 storage、精确 chatgpt.com host 和所需的脚本能力。只使用静态 content scripts 时不为“以后可能用”预先申请 scripting；若使用动态注入则明确需要。标签页与导航所需字段按 Chrome 对应 API 权限审查，能依赖已授予 host 的不扩大为全浏览历史。

默认不申请 cookies、debugger、history、all_urls、nativeMessaging。更不能为了自动改几个标题要求用户常年允许远程调试。`chrome.debugger` 确有强大 CDP 操作能力，但权限和影响面与基础整理不相称，只能是独立明确研究的可选路径，不作静默降级。[S25][S28]

JS/WASM 运行逻辑随扩展包发布，不从云下载“修复脚本”。可远程发布的有限配置或模型数据必须保持为数据，经过 schema/签名/大小验证，不能藏解释执行的代码。紧急远程能力关闭可以考虑，但不能远程扩权。[S27]

## 13. 数据模型与写入规则

以下是逻辑契约，不是本轮实施代码。

| 实体 | 关键字段 | 所有权 |
|---|---|---|
| Scope | provider、已核验账户/原生组织身份、vault ID、verification、epoch | 安全与身份层 |
| ConversationRef | scope ID、原生 conversation ID、canonical URL、native title observations、native Project observations、availability | 来源观察只追加/修订证据，不由 AI 覆盖 |
| EvidenceSlice | conversation/branch/message ID、author attribution、channel、capture time、coverage、正文或最小特征、revision | 授权输入证据；可撤销与删除 |
| Workspace | stable ID、名称、owner、revision、archive state | 用户及受控派生层 |
| Placement | conversation ID、workspace ID、facet、human/AI owner、include/exclude、evidence | 人工约束优先 |
| DisplayIdentity | 对话 ID、display title、aliases、owner、lock、revision、naming policy | 人工标题不可自动覆盖 |
| Series / SeriesEdge | 稳定系列 ID、precedessor、continuation/branch、序号策略、证据 | 明确关系，不靠标题字符串充当主键 |
| Workset | account scope、tab/document 实例、引用顺序、当前项、可选锚点、snapshot revision | 用户工作现场 |
| NativeWritePlan / Receipt | command ID、scope、conversation ID、old/new title、preconditions、consent、status、timestamps | 独立特权通道 |
| IntentLog | operation ID、base revision、delta、inverse/conflict metadata、author、time | 人工操作历史 |

持久写入使用 IndexedDB 事务和 revision 比较；队列、结果提交、撤销指针在同一事务内协调。仅宣称“有一个 service worker”不等于已经解决并发、重启和其他扩展页面写入。

同一对象同时被两台设备人工编辑时，不以最后时间戳默默覆盖；保留冲突并要求选择。AI 结果低于人工结果。工作区删除仅删除/隐藏派生容器和关系，不删除原生聊天；删除证据索引也不删除原生内容。

备份包含人工作品与必要来源引用，敏感正文单独可选加密。恢复不能自动重放旧原生写入计划、云调用或过期授权。恢复到不同账户必须先匹配范围，不允许“一键全导入当前账号”。

### 13.1 可恢复性、加密与同步

本地保存不是保密承诺：扩展库、搜索词、向量、别名和关联图都可能暴露个人事项。备份默认包含人工组织与最小来源引用；敏感证据正文必须单独选择。可选端到端加密同步应由客户端加密，服务端仅保存密文和最小同步元数据；它不能与“云模型需要读取已批准证据”混为一谈，后者必须另外披露明文处理边界。

同步人工操作日志和对象 revision，不同步过期授权、待执行原生命令或云重试任务。保留 tombstone 防止旧设备复活已删条目；设备撤权后拒收旧设备写入。双设备冲突保存两份人工作品，不因设备时钟较晚就覆盖。丢失密钥的恢复机制、服务端可见元数据、删除与备份保留期限必须在上线前明确，不能空称“军事级加密”。同步与密钥恢复尚需单独工程验证，不是本轮已实现的能力。

## 14. 账户隔离与安全边界

目前最难的不是分配一个 UUID，而是证明“正在显示的网页内容属于哪个原生账户和组织”。ACS 已把这个问题留为未验证；浏览器 profile、邮箱显示名、头像、安装 ID、tab ID 和最近聊天指纹均不能单独替代原生范围证据。[G1][G2]

官方 OAuth 可以认证扩展登录的身份，但网页可能切换到另一个 ChatGPT 账户。所以必须分别维护：**扩展账户身份、当前宿主文档身份、数据来源身份**，三者匹配后才允许持久读取、显示敏感别名、云处理和原生写入。

账户切换时先撤销旧 document/epoch 的任务与 UI，再等待新范围确认；每个异步边界后重新检查，而不是只在任务开头检查一次。范围不确定时不显示旧库，可返回原生导航。

承认现实边界：如果无法可靠取得和绑定宿主身份，不能营销“同一 Chrome 内多账户自动无缝隔离已保证”。可限定为明确验证过的运行模式或独立浏览器资料环境，但这仍要实验；用户手选资料库只是风险可见的降级，不能宣称达到同等级自动隔离。

### 14.1 威胁模型

覆盖恶意网页/第三方脚本、伪造 postMessage、页面内容提示注入、同名共享链接、账户切换竞态、被污染导出、依赖投毒、扩展间互相重写标题、模型供应商泄露和误授权。

MAIN-world 的消息只是候选事实，不是授权。Extension worker 验证 sender、document、frame、scope、schema、大小和状态；页面提供的任意 URL 不能进入通用 fetch 或原生操作执行器。不得将全文或密钥放进 web-accessible 资源。

原生写入/云处理的重要同意应在扩展自己拥有的可信 popup/独立页面完成，不能仅凭网页里一个可被宿主覆盖的按钮授予高权限。模型 API 密钥不嵌入扩展包；商业网关与供应商密钥由服务端持有并执行额度策略。

## 15. 原生改名：独立授权执行通道

默认派生模式不启用原生写入能力。这里的细粒度授权是产品自身的能力控制，并非 Chrome 能提供“仅允许改这一条聊天标题”的独立权限；获准访问网页的内容脚本在技术上可修改 DOM。因此隔离必须由最小执行器、可信授权界面、审计与安全测试共同落实，不能仅靠安装权限文案证明。授权分为内容、对象、次数、时间与操作类型；“允许整理我的工作区”不包含“允许修改原生标题”，更不包括移动、删除、归档、发送或分享聊天。[S13][S28]

推荐状态机：

`DRAFT → REVIEWED → AUTHORIZED → PRECHECKED → EXECUTING → VERIFIED / FAILED / UNKNOWN`

执行前展示目标账户/原生空间、准确对话、原生旧名与新名、来源和此次数量。默认逐条串行，当前页面验证成功后才继续下一条；不自动打开一批隐藏标签页。

执行前重读账户、conversation ID、原生旧标题、路由/渲染归属、精确菜单与编辑框。旧标题已变、目标不唯一、弹窗不符或存在待处理用户操作时停止。DOM 比较不是服务端原子 CAS，无法完全消除最后一瞬间的并发竞态，因此仍需 post-read 和冲突回执。

执行后只有在同一范围、同一对话读到预期新名才报告成功。超时不等于失败、点过按钮不等于成功；结果不明记 UNKNOWN，不盲目重试。用户批准的一批中途撤销，停止未执行项，清楚列出已经验证成功和未知项。

撤销原生改名是另一次真实写入：仅当前标题仍等于本次写入的新标题时，提议恢复旧标题；若用户后来另改，保留冲突，不能覆盖。不能承诺任何原生动作都可以无条件回滚。[G6]

通用 Agent 可以帮助解释“为什么失败”或建议适配修订，但不能在生产环境见到失败就自行探索菜单、放宽 selector、绕过授权。带页面控制权限的研究实验必须与普通消费者运行配置分离。

## 16. 与 PAIA 的边界及旧项目继承

**新产品管理：**对话引用、派生工作区、标题、系列、浏览器标签页映射、工作集、原生操作回执、仅为上述任务必要的授权索引。

**PAIA 管理：**用户输入原始档案、可编辑工作内容、思想库、Personal Topics、AI Context、提示词复用及相应个人资料权限。[G8][G10]

同名“PAIA 工作区”和“PAIA 思想主题”不是同一个数据库实体。需要时通过显式映射连接，不共享可写 ID、不自动合并、也不把一个产品的授权继承给另一个。

新产品必须独立可用，不能先要求安装 PAIA。未来已安装 PAIA 时，可通过经过授权、版本化、白名单校验的本地扩展通信接口获取最小输入证据或来源引用，避免重复保留正文。接口是待设计的集成，不是当前仓库已提供的能力。

多个扩展共存时，每一块导航/标题/输入区域只能有一个实际呈现 owner。新扩展取得导航所有权后，ACS 的旧 projection 应停用；原生改名只由一条执行器负责，不能 CTM 和新产品同时写。PAIA 输入浮板保留在自己的安全区域，双方交换布局占用信号，而非互读私有 DOM。其他第三方扩展占用冲突时提示一次选择，不尝试悄悄关掉它。

建议后续建立新仓库，而非把四个旧扩展直接拼装：按固定 SHA 提取小型模块/测试思想，先确认许可证、依赖、数据边界和新验收。旧项目保持不变；是否归档、迁移或正式抽共享库由用户另行决定。

## 17. 实验与成功标准

**下列均为拟定验收目标，不是本轮已经达到的数据。** 安全错误不能用总体成功率冲淡；零观测事故也不能证明未来绝对安全。

| 实验 | 方法与对照 | 初始成功标准 | 失败后的裁决 |
|---|---|---|---|
| E1 数据与条款路径 | 官方导出、当前 DOM、可选被动观察分别审查；真实个人/托管账号样本 | 来源、权限与覆盖可解释；基础体验不依赖未经确认的全量抓取 | 关闭不成立的渠道，不伪装已全量 |
| E2 账户与渲染归属 | 两账户、多原生组织、同标题、共享链接、快速切换、挂起恢复；异步竞态注入 | 测试中零跨范围显示/存储/云传输/写入；未知必须拒绝 | 不发布无缝多账户能力 |
| E3 原生能力保留 | 发送/停止/编辑/分支/附件/模型菜单/Canvas/语音/新型内容；原生对照 | 核心功能无新增阻断；输入、焦点和草稿不丢失 | 对不支持路由退回原生 |
| E4 兼容与退出 | 真实 unpacked MV3、更新、worker 终止、冻结、禁用、DOM 重建、CSS 故障 | 扩展内切换可恢复；刷新后原生无残留依赖；异常恢复边界有记录 | 缩小外壳控制区，不能空白 fail-closed |
| E5 命名与分类 | 至少 1,000 条经同意、中文优先、含困难反例的评测；按用户/系列/时间隔离训练与测试 | 自动归属精确率目标≥98%；标题直接接受率≥90%；人工保护100%；同时报告覆盖率/置信区间 | 降自动覆盖，不降低人工保护 |
| E6 找回与继续工作 | 原生、主流竞品、规则版、规则+embedding、规则+LLM 的相同任务盲测 | 中位找回/恢复时间下降目标≥30%；错误来源/系列不增加；周纠错负担≤2分钟为早期假设 | 不用更多功能掩盖无收益 |
| E7 稳定性 | 同一证据重复运行、模型升级、无关消息插入、人为纠错 | 无新有效证据时稳定名字不变；所有 exclude/lock 被遵守 | 禁止自动重构已有组织 |
| E8 原生改名 | 同名目标、旧名漂移、菜单本地化、会话切换、断线、未知结果和撤销冲突 | 验收集合零错误对象写入；每项有真实状态；无盲重试；串行暂停正确 | 原生写入保持关闭，派生仍可独立使用 |
| E9 大数据与性能 | 1k/10k/100k 引用，中文长输入，弱设备与多标签；固定浏览器/设备 | 10k 已知引用下本地导航 p95<150ms、检索首屏目标<300ms；无扩展造成的持续输入卡顿 | 索引分片/虚拟列表/资源预算，另测模型内存 |
| E10 恢复与数据资产 | 崩溃注入、配额失败、备份恢复、撤销、升级迁移、离线冲突 | 人工修改可回读；损坏备份拒绝；不重放 native/AI 副作用 | 暂停自动迁移，保留原库和恢复入口 |

不要只在开发者自己的 PAIA 语料上做分类验收。评测至少覆盖否定句、引用/模板、同名实体、反讽、多个项目并行、短问句“继续”、长期主题变化、旧历史首次观察和产品版本/聊天序号混杂。

标注允许多重归属与“未知”；两位标注者冲突不强行算模型错。除准确率外报告各类 precision/recall、覆盖-错误曲线、系列边准确率、无证据改名率、纠错后复发率，以及“看着整齐但找错工作”的真实用户失败。

100k 是压力上限研究，不等于首发承诺的完整正文或向量规模。不同能力与设备给出明确支持档位，避免一个漂亮基准概括所有场景。

## 18. 完整开发路线，而不是 MVP

路线按依赖和风险组织，不以“先做难看的小版本”替代最终设计。整体交互与数据所有权先设计完整，各切片独立验证后汇合。

| 阶段 | 完整交付范围 | 必要退出条件 |
|---|---|---|
| A 产品验证与权限路径 | 本研究、全流程原型、竞品任务对照、读取与条款路线、身份与外壳能力实验 | 核心体验增益和至少一条可持续数据路线成立；明确不承诺项 |
| B 数据与可靠性基础 | Scope、ConversationRef、覆盖度、IDB、IntentLog、事务、备份/恢复、权限撤销、隔离测试 | 数据不依赖 UI 生命周期；用户修改与未知状态可靠保留 |
| C 完整工作空间体验 | 工作区/分面/系列/工作集、原位导航、搜索、片段、纠错、新建目的地、多标签协同、原生切换 | 核心原生功能与可访问性通过；整个日常闭环可用 |
| D 智能组织产品化 | 稀疏候选、中文命名、稳定策略、首次批处理、影子评估、本地模型可选、云 AI 授权预算 | 高精确率与低管理负担达标，失败可回落到规则/人工 |
| E 原生写入专项 | 单条/有限批次改名、可信预览、精确执行、回执、暂停、冲突撤销 | 登录态专项验收；不能借用派生 UI 测试当证据 |
| F 消费级旗舰完善 | 大数据性能、空态/错误态、深浅主题、快捷键、语言、升级迁移、离线、加密可选同步、支持与商店披露 | 真实用户连续使用、跨设备/账户规则和恢复稳定 |
| G 可选生态连接 | PAIA 最小证据接口、扩展共存协议、经确认的官方身份/用量接入 | 独立授权、无重复资产 owner、无隐式扩权；不拖累独立可用性 |

C 的视觉/交互设计可以与 B 的基础实现并行；D 的标注和离线试验可先进行。E 不应该成为 C 的依赖。某个高级渠道被阻断，只阻断该能力，不制造整个项目无限等待的流程。

旗舰版的最低完整闭环是：**真实可用的获取路径＋跨来源工作区＋稳定标题/系列＋工作现场＋搜索与纠错＋原生恢复＋用户资产恢复**。高质量云 AI、端侧模型、原生批量写入和同步在证据达标后加入完整产品，不用未验证的高风险功能冒充“更旗舰”。

## 19. 商业与长期判断

值得继续研究，但不应立刻把全部资源投入“重做 ChatGPT”。已有产品证明有人为组织和高频效率工具付费或持续使用，但商店用户数不能当作你的付费市场规模或利润预测。

先验证用户是否愿意长期信任这层界面，以及关闭它后是否明显感觉工作断裂。若收益主要来自外观变化或手工目录，维护宿主 DOM 的长期成本可能不值得。若稳定标题、正确系列、少管理和现场恢复确实节省时间，才有差异化依据。

原生 Space 和搜索的持续进步会吞掉普通整理功能，因此不要重做文档协作、Prompt 库和模型聊天。更耐久的资产是用户可迁移的工作结构、稳定性、可解释纠错、兼容能力和真实任务评测，而不是按钮数量。

## 20. 本轮原型与后续验证的关系

配套 `prototype.html` 演示工作区聚合、分面、搜索、原生/派生切换、显示改名与人工锁、归属纠错与撤销、工作现场、示例账户隔离、覆盖度说明、模拟原生改名授权和故障回退。全部名称、对话和状态是专门构造的示例，不是从用户 ChatGPT 抽取的聊天内容。

原型中的聊天区也是示例，不能证明原生 DOM 已保留、消息能真实发送或平台功能已经兼容。它不会调用模型、请求 ChatGPT、修改真实标题、读取浏览器标签页或访问账户。模拟账户选择也不代表真实身份技术已解决。

原型保存部分演示状态在本地浏览器；只应输入无敏感性的测试内容。使用“重置演示”可清除该原型自己的状态。测试记录另附，任何原型通过项都不能升级为扩展生产验收。

## 参考资料与仓库来源

所有网页访问日期：2026-10-10。动态页面可能继续变化；仓库源文件使用固定 SHA。供应商页面只作为其自身功能声明。

<!-- GENERATED_REFERENCE_LIST -->

<a id="ref-G1"></a>

**G1 — ACS · 当前能力试验状态**  
[https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/status/ACS_STATUS.yaml](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/status/ACS_STATUS.yaml)

<a id="ref-G2"></a>

**G2 — ACS · Frozen Design v0.1**  
[https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/docs/FROZEN_DESIGN_v0.1.md](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/docs/FROZEN_DESIGN_v0.1.md)

<a id="ref-G3"></a>

**G3 — ACS · 原生列表投影与恢复试验代码**  
[https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/src/content.js](https://github.com/haohongfei2001-png/adaptive-contextual-sidebar/blob/7495158e9d3e3b383feafe00cea810e8954cac82/src/content.js)

<a id="ref-G4"></a>

**G4 — Context Tabs · 当前状态**  
[https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/status/CONTEXT_TABS_STATUS.yaml](https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/status/CONTEXT_TABS_STATUS.yaml)

<a id="ref-G5"></a>

**G5 — Context Tabs · 浏览器标签页事件与视图**  
[https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/src/sidepanel.js](https://github.com/haohongfei2001-png/context-tabs/blob/8ccdd75255e37bb4a2ff92da427a7be86c6192f7/src/sidepanel.js)

<a id="ref-G6"></a>

**G6 — Chat Title Manager · Draft PR #1 与未完成的真实改名验收**  
[https://github.com/haohongfei2001-png/chat-title-manager/pull/1](https://github.com/haohongfei2001-png/chat-title-manager/pull/1)

<a id="ref-G7"></a>

**G7 — Chat Title Manager · 固定候选的命名与序号代码**  
[https://github.com/haohongfei2001-png/chat-title-manager/blob/3222066812e08aa75119247de5ec5968e3bfbaeb/src/naming.js](https://github.com/haohongfei2001-png/chat-title-manager/blob/3222066812e08aa75119247de5ec5968e3bfbaeb/src/naming.js)

<a id="ref-G8"></a>

**G8 — PAIA · 实际 manifest 0.43.4**  
[https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/manifest.json](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/manifest.json)

<a id="ref-G9"></a>

**G9 — PAIA · 当前 STATUS（与旧版本叙述区别）**  
[https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/docs/consumer-product-v1/STATUS.md](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/docs/consumer-product-v1/STATUS.md)

<a id="ref-G10"></a>

**G10 — PAIA · 产品与用户输入数据边界**  
[https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/README.md](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/README.md)

<a id="ref-G11"></a>

**G11 — PAIA · 既有请求的被动 response observer**  
[https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/content/response-observer.js](https://github.com/haohongfei2001-png/paia/blob/6b4f96199e4f2de4040b1ed505a3610186b6815e/extension/content/response-observer.js)

<a id="ref-G12"></a>

**G12 — HCL · 当前产品队列与能力边界**  
[https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/README.md](https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/README.md)

<a id="ref-G13"></a>

**G13 — HCL · Assistant-first UX / Continuum 原则**  
[https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/docs/UX_SPEC.md](https://github.com/haohongfei2001-png/hcl-assistant/blob/b083ac25e22176a58eb048068b90ceb485800c8c/docs/UX_SPEC.md)

<a id="ref-S1"></a>

**S1 — OpenAI · Projects in ChatGPT**  
[https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)

<a id="ref-S2"></a>

**S2 — OpenAI · Finding your chats, projects, and files**  
[https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)

<a id="ref-S3"></a>

**S3 — OpenAI · Getting started with Space**  
[https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt)

<a id="ref-S4"></a>

**S4 — OpenAI · Exporting your history and data**  
[https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)

<a id="ref-S5"></a>

**S5 — OpenAI · Temporary Chat**  
[https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt)

<a id="ref-S6"></a>

**S6 — OpenAI · Sharing conversations and scheduled tasks**  
[https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt)

<a id="ref-S7"></a>

**S7 — Chrome Web Store · AI Toolbox**  
[https://chromewebstore.google.com/detail/ai-toolbox-folders-prompt/jlalnhjkfiogoeonamcnngdndjbneina](https://chromewebstore.google.com/detail/ai-toolbox-folders-prompt/jlalnhjkfiogoeonamcnngdndjbneina)

<a id="ref-S8"></a>

**S8 — AI Toolbox · 开发者产品与同步说明**  
[https://www.ai-toolbox.co/](https://www.ai-toolbox.co/)

<a id="ref-S9"></a>

**S9 — Chrome Web Store · Superpower for ChatGPT**  
[https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc](https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc)

<a id="ref-S10"></a>

**S10 — Chrome Web Store · ChatGPT Organizer / Smart Auto Folders**  
[https://chromewebstore.google.com/detail/chatgpt-organizer-smart-a/fifjakginaannmjjejmfagoglkiocbco](https://chromewebstore.google.com/detail/chatgpt-organizer-smart-a/fifjakginaannmjjejmfagoglkiocbco)

<a id="ref-S11"></a>

**S11 — Chrome Web Store · ChatGPT Organizer & Workspace**  
[https://chromewebstore.google.com/detail/chatgpt-organizer-workspa/mngeddjcngpcdakdhfcbaefeonmmeomg](https://chromewebstore.google.com/detail/chatgpt-organizer-workspa/mngeddjcngpcdakdhfcbaefeonmmeomg)

<a id="ref-S12"></a>

**S12 — Sortbase · 开发者产品声明**  
[https://sortbase.ai/](https://sortbase.ai/)

<a id="ref-S13"></a>

**S13 — Chrome · Content scripts 与隔离环境**  
[https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

<a id="ref-S14"></a>

**S14 — Chrome · Extension service worker lifecycle**  
[https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

<a id="ref-S15"></a>

**S15 — Chrome · Storage and cookies / origin 边界**  
[https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)

<a id="ref-S16"></a>

**S16 — Chrome · Storage API**  
[https://developer.chrome.com/docs/extensions/reference/api/storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

<a id="ref-S17"></a>

**S17 — Chrome Web Store · User data policy FAQ**  
[https://developer.chrome.com/docs/webstore/program-policies/user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

<a id="ref-S18"></a>

**S18 — Chrome · Prompt API / 支持语言与设备条件**  
[https://developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api)

<a id="ref-S19"></a>

**S19 — ONNX Runtime · Web / WASM / WebGPU**  
[https://onnxruntime.ai/docs/tutorials/web/](https://onnxruntime.ai/docs/tutorials/web/)

<a id="ref-S20"></a>

**S20 — OpenAI · Sign in with ChatGPT / OSS 与计划用量**  
[https://developers.openai.com/siwc/token-sharing-open-source](https://developers.openai.com/siwc/token-sharing-open-source)

<a id="ref-S21"></a>

**S21 — OpenAI · Sign in with ChatGPT on your website**  
[https://developers.openai.com/siwc/website](https://developers.openai.com/siwc/website)

<a id="ref-S22"></a>

**S22 — OpenAI · Multiple accounts / account switching**  
[https://help.openai.com/en/articles/20001068-use-multiple-accounts-with-account-switching](https://help.openai.com/en/articles/20001068-use-multiple-accounts-with-account-switching)

<a id="ref-S23"></a>

**S23 — OpenAI · API conversation state**  
[https://developers.openai.com/api/docs/guides/conversation-state](https://developers.openai.com/api/docs/guides/conversation-state)

<a id="ref-S24"></a>

**S24 — OpenAI · Terms of Use**  
[https://openai.com/policies/terms-of-use/](https://openai.com/policies/terms-of-use/)

<a id="ref-S25"></a>

**S25 — Chrome · Debugger API**  
[https://developer.chrome.com/docs/extensions/reference/api/debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger)

<a id="ref-S26"></a>

**S26 — Chrome · Offscreen documents**  
[https://developer.chrome.com/docs/extensions/reference/api/offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)

<a id="ref-S27"></a>

**S27 — Chrome · Remote hosted code policy**  
[https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

<a id="ref-S28"></a>

**S28 — Chrome · Declare permissions**  
[https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

### 开放 PR 的研究快照

PAIA：#231（并发正文分支候选）、#188/#187/#179/#178（不同层级的 Context 候选）、#182（Thought 只读投影）、#140/#132（视觉/编辑视图候选）、#99（历史 Context/Prompt 工作）、#91（网站设计）。这些状态只代表本轮查询，不能替代后续 main 与当前队列。

HCL：#55（视觉候选）、#53（隔离合成测试候选）。Chat Title Manager：#1（Draft）。ACS 与 Context Tabs 的开放 PR 查询没有返回结果。

本轮没有通过 PR 的开放状态推断所有分支都还在开发；没有触发构建、合并或改写任何队列。
