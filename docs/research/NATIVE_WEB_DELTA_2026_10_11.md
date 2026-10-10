# 2026-10-11 ChatGPT网页版定向补漏

范围：只补当前VAIWL方案中的功能/状态遗漏和过时假设，不重做竞品研究。阅读官方在线文档；未进入用户登录态，不声明已经测到其字体、头像、DOM结构、账户资格或全部实际入口。下面的保留策略是设计决定，不是已完成的原生接入。

| 项目 | 本轮官方证据 | 对VAIWL的修订 |
|---|---|---|
| 交互回复与渐进生成 | 10月7日发布记录介绍Intelligent UI与回答过程中继续思考/使用工具[S1] | 只保护“消息文字/输入框”不够：回复内表单、控件、局部交互状态和持续生成由原生持有；工作区往返不能重建 |
| 原生Pinned/Recents | 官方记录包含聊天与项目固定、Recents合并或按项目分组[S1] | 原生固定不是VAIWL主题固定；保留用户已有原生固定对象及操作，不用30日过滤清掉；恢复原生时保留用户原排序 |
| 音频上传 | 上传文档明确付费计划/工作空间的音频附件支持，依账户、地区和模型而变[S2] | 不能只保留麦克风按钮；文件选择、音频附件、处理中/失败状态均保持原生。不把手机扫描或桌面录音补画为网页普遍能力 |
| 临时聊天的状态转移 | 临时聊天可选择个性化，后续可保存为普通聊天[S3] | v2.6将临时按钮泛放在已保存会话头部的示意应删除；真实模式、选择/保存流程照原生。临时阶段默认不持久索引；保存动作不是新发送，仍须按正常scope/采集权限接入 |
| 文件独立生命周期 | Library文件可独立于聊天保留；删除聊天不等于删除仍在Library的文件[S4] | 时间归档/主题移除绝不删除文件；保存/删除/Recently deleted及存储入口按宿主保留，不做派生恢复替身 |
| 购物与图片附属动作 | 10月1日记录包含试穿、参考照片、收藏等；Images有专用编辑与模板入口[S1][S5] | 不再只检查Images主按钮；原生商品卡动作、图片编辑、参考照片及Library收藏也不能被简化聊天渲染器吞掉 |
| GPT资格与迁移 | 当前说明：个人账户不能新建/发布GPT，既有GPT按资格可用；部分工作空间有退役/迁移计划[S6] | 不能照旧清单生成“新建GPT”；保留现存可用入口、限制和迁移提示，不抢先删除仍可用GPT。时间表不是所有用户都已完成迁移的证明 |
| 群聊旧记录 | 官方7月起逐步停止新建/加入群聊，现有历史保留，可能转为只读[S7] | 不新增假群聊创建入口；已存在群聊及只读状态留在原生，不把别人发言当本用户活跃发送 |
| 搜索范围 | 官方侧栏搜索覆盖多种账户内容，可含连接来源，归档聊天也可检索[S8] | 原生搜索继续原生；扩展别名搜索独立并诚实声明覆盖，不能以局部结果降级原搜索 |
| Project上下文 | 原生Project保有文件/指令、记忆和成员；移入会话可改变继承上下文[S9] | 派生聚合不得代替原生设置、来源管理、成员与权限；用户去掉重复来源标签不等于删除真实原生上下文提醒 |
| Agent旧说明冲突 | Agent帮助页开头提示已停用、改用Work，后文仍残留旧启动说明[S10] | 明确记录文档内部不一致。不据旧段落造Agent按钮；以账户实际可用Work/相关原生入口为准，不以文档审计宣称用户账户已验证 |

## 保留策略

用“是否存在、由谁拥有、是否原生可折叠、是否有待处理状态、如何返回”记录每个实际入口。默认原生，不给每个新功能在VAIWL建一个仿制菜单。模型/思考选择、工具/授权、通知与运行状态、Voice/Canvas/文件/图片专用面板、原生账户/组织切换、dot真实身份继续继承v2.6保留矩阵。

新增能力未知时保留原区域；停用或未开通时不凭静态字典画成可用按钮。不能以“保留所有功能”为理由提前制造官方不存在的功能。公开文档缺完整登录态布局证据；R0清洁环境需核对入口、操作、结果、状态权限、返回五格，不用链接清单代替真实通过。

## 官方来源（本轮实际查阅）

- [S1 ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- [S2 Uploading files and audio](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt)
- [S3 Temporary chat](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt)
- [S4 Chat and file retention](https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt)
- [S5 Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt)
- [S6 Creating and editing GPTs](https://help.openai.com/en/articles/8554397-creating-and-editing-gpts)
- [S7 Retiring group chats](https://help.openai.com/en/articles/12703475-retiring-group-chats-in-chatgpt)
- [S8 Finding chats, projects and files](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)
- [S9 Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [S10 ChatGPT agent](https://help.openai.com/en/articles/11752874-chatgpt-agent)

失败的未解析网页请求不作为来源。没有用公开营销菜单推断用户账户功能，没有读取实际私人会话或真实dot头像。
