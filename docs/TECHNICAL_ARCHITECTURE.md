# Chrome 扩展技术架构与 ChatGPT 适配

状态：PROPOSED / LIVE_HOST_NOT_VERIFIED。来源：原研究 §10–15、G1–G3/G11、S13–S16/S25–S28；均可在 [来源登记](research/SOURCE_REGISTER.md) 查到。当前只设计，不创建 manifest 或 runtime。

## 1. 选定研究路径

主方案为原位导航外壳＋保留原生能力区。零散增强可作为手段；完整克隆前端、iframe 嵌入、独立浏览器均不是本产品依赖；低频可信扩展页面用于授权、导入和恢复。

外壳负责可逆投影与本地导航，绝不接管发送/工具执行。原生 transcript、composer、model menu、上传/Canvas/语音/工具 portal 不移动、不克隆、不放到自制 renderer。禁止读取私有 React store 或补造 ChatGPT 内部路由。

## 2. 模块及数据流

获准 DOM/用户导出 → HostAdapter/ImportParser → ObservationValidator → ScopeGate → 扩展 Repository/IDB → 词法索引、IntentLog、EvidencePack → ProjectionReducer → DerivedShell/Workset/DisplayTitles。

AI 只向 SuggestionBatch 提交受限候选；Reducer 在当前授权/revision 下接受或拒绝。独立真实写入路径是 TrustedReview → NativeWritePlan → ScopedExecutor → Receipt；任何普通显示操作不能走入该通道。

| 模块 | 职责 | 禁止承担 |
|---|---|---|
| HostAdapter | 路由/文档/来源/用户角色/控件证据与能力状态 | 业务分类、擅取全历史、授予权限 |
| ScopeGate | 三种身份及 epoch/currentness 检查 | 以 display name、vault 选择或 OAuth 单独冒充宿主认证 |
| Repository | 原子命令、revision、日志、恢复、授权撤销 | 页面 origin 存库、AI 直接存储 |
| Index/Planner | 已知范围词法/候选、分块任务与预算 | 同步导航等待云模型、默默全文抓取 |
| ProjectionReducer | 人工优先、稳定性、冲突与别名投影 | 覆盖原生事实或跨 scope 合并 |
| DerivedShell | 自有 DOM、布局、导航和退回 | 重渲染原生消息/输入，强制刷新 |
| TabCoordinator | 同范围 tab 绑定、去重、现场恢复 | 把所有 Chrome tab 当永久工作集 |
| NativeExecutor | 已批准精确改名、前后核验与 UNKNOWN | 通用 Agent 自主探索菜单、删除/发送/移动 |

## 3. 能力协议，不写假 selector

适配输出至少覆盖 observeConversation、observeUserMessages、observeNativeProject、mountNavigation、openNativeConversation、openNativeProject、restoreNative、renameNativeTitle。每项有 `verified / unavailable / ambiguous`、adapter version、宿主变体、document/route/epoch 和依据；真实运行状态来自实验，不预设支持。

身份来源尚未证明。B/C 实施不能把手工 vault 选择或某条路由当全局唯一 scope。documentId/frame、会话 ID 与渲染内容需共同验证；SPA 中途、旧 DOM、后退/前进、挂起恢复使旧令牌失效。只读导航可工作而正文读取未验证时，正文路径仍关。

唯一目标采用语义 DOM、可访问名称、经证实属性和结构约束联合；CSS 类只是线索。目标零个/多个、Project 标记矛盾或正文归属不明时，不读取/不执行。代码中的已知内部 response 路径不构成官方历史接口。

## 4. DOM、导航与样式所有权

仅附加自有挂载点/命名空间属性/可撤销样式。恢复不能覆盖一整份旧 style 字符串抹掉宿主同时更新；隐藏原生导航还需处理 focus/读屏及 portal，不可留下隐形焦点陷阱。

Shadow DOM 用于样式，不是可信权限界面或账户隔离。页面消息与 MAIN world 观察都是不可信输入。重要授权在扩展 origin 的可信页面，不能仅凭宿主页面按钮获得真实写权。

对话导航优先用经过验证的原生入口或同源 canonical URL；不修改原生 history.state。概览是扩展 view state。支持修饰键、中键及链接复制；真实聚焦已有 tab 需当前账户/native-space/conversation 一致。原型的 openChat() 与 render() 不可复用为正式导航实现。

## 5. MV3、存储与任务

扩展 origin IDB 持有数据；content script 访问宿主 Web Storage/IDB 不是扩展库。chrome.storage 只放小设置并限制 content-script 可见范围，全文/向量/日志不塞进 sync。

worker 可终止，所有重要任务阶段与 operationId 可恢复；不以无限心跳保活替代状态设计。耗时索引在受生命周期管理的 worker/扩展页面按块执行；offscreen 仅在 API 用途、权限及必要性成立时考虑，不拿来做任意永久进程。

同步交互只需缓存和本地规则；AI/历史网络不在点击关键路径。存储满、升级中断、任务重复恢复与多个扩展页面并发是 B5/E10 必测，不用纯内存 Map 代替。

## 6. 权限建议

基础仅审查必要的 `storage`、精确 `https://chatgpt.com/*` 和静态 content scripts。静态脚本够用就不先要 scripting；动态注入真正需要再申请。标签页/导航字段按 API 和已授 host 核对，不为方便读取全部浏览历史。可选 tabs/webNavigation/offscreen/cloud origin 每项都需用途与独立评审。

默认不申请 cookies、debugger、history、all_urls、nativeMessaging，不复用日常 profile。生产不要求用户长期打开远程调试；测试自动化环境单独授权，不能变成消费者权限。

JS/WASM 逻辑随扩展发布，云端配置只能关闭预定义能力或提供验证后的数据，不能下载执行“自动修复脚本”。远端 kill switch 不可新增 selector 执行路径或扩权。云模型 key 不进包，商业网关凭证/配额由服务端保护。

## 7. 兼容与发布

R0 建立支持组合：浏览器/OS/账户类型/原生组织/布局/页面路由/PAIA 版本/权限。每次宿主变体只打开已验能力；回归用脱敏 fixture 与单独获准的 clean-account live 实验。第三方扩展冲突只提示或退让，不自动关闭对方。

公开发布需数据路径/条款、隐私披露、真实原生不回归、恢复和可访问性同时成立。暂不能验证某数据渠道就不宣传全历史；原生写入失败则该能力继续关闭，不影响已经证明的只读路径。
