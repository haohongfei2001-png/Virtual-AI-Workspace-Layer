# VAIWL B1：受限 ScopeRepository + DocumentBindingBroker 实施及独立验证

Status: **B1 LIMITED IMPLEMENTED / REAL CHATGPT BLOCKED**. 用户明确授权开展B1受限工程；本次不扩大为C2聊天接管、真实账户/私人数据、自动导入或正式安装/发布。

## 继承的基线

- 设计与计划：Draft PR #1 的 \`79dbfa7e6e71595bfcc543334204975000469ac9\`，v2.7固定30当地日历日和原生所有权不变。
- 实际技术证据：独立R0 Draft PR #4，\`7d47d97bc7990cec7fd1d8a2a61797bf90e1c96f\`。R0整体LIMITED，原始C09旧lease阻塞新document；旧content探针漏SPA pushState；禁用后有DOM残留；真实ChatGPT通过数0。
- 本提交从PR #1设计分支创建独立B1特性分支，不把R0探针和全部失败日志复制到正式模块，不合并PR #1/#4/main。

## 实施范围

| 项 | 已实施 | 未承诺 |
|---|---|---|
| extension-origin ScopeRepository | IndexedDB分scope不可变引用，原子CAS、操作幂等与冲突检测、多tab访问 | 真实账号认证、敏感内容、配额/迁移/损坏恢复 |
| DocumentBindingBroker | \`MessageSender\`与当前\`webNavigation.getFrame\`双校验；精确client/seq/lease；可信新document可接替未过期旧lease；过时请求拒绝 | 真实ChatGPT账号witness；动态SPA自动重连、freeze/disable瞬时清场 |
| MV3可运行证明 | 只针对127.0.0.1合成fixture构建，worker和IDB真实运行；不访问真实ChatGPT | 一套生产manifest、真实聊天重排/发送/原生组件接管 |
| 部分路由失效 | Chrome \`onHistoryStateUpdated\`触发同步broker撤权＋尽力通知content脚本 | 真实SPA新文档就绪识别和无残留保证 |

浏览器消息不能提供\`scope\`/\`accountId\`/\`organizationId\`，只有privileged resolver可返回验证范围；本轮唯一已实现resolver只把合成fixture的A/B路径映射为测试标识。没有可信真实ChatGPT适配器时**不能使用这些模块显示任何私人数据**。页面的URL、Chrome tabId、Profile和用户名显示都不是账户身份。

仓库仅储存native引用\`conversationId/nativeUrl/projectId/revision\`，不包含消息正文/输入草稿/密码或token。旧响应在worker、document epoch和提交前均被检查。注意提交已进入IDB队列后若发生导航，不能证明无竞态写入；当前仅允许非敏感引用，真正的敏感写入仍需增强fence和真账户事件验证。

## 真实运行证据（macOS独立临时环境）

- Mac：macOS 27.0 arm64；Chrome 154.0.8037.99；Node 26.8.2；Playwright 1.64.0，局部依赖。
- 全新\`/tmp/vaiwl-b1-*\`目录与全新Chrome Profile，headless + CDP \`Extensions.loadUnpacked\`，原生MV3 worker；仅127.0.0.1合成页面。未访问登录ChatGPT、日常Profile、PAIA或其他私人来源。
- broker单元测试 **10/10 PASS**，包括未知身份拒绝、浏览器确认新document快速接替、旧token/序号/超时拒绝、SPA失效、跨scope拒绝、worker重新绑定及迟到resolve拒绝。
- 真实Chrome synthetic fixture **11/11 PASS**，包含两标签并发创建的CAS“一胜一冲突”、固定operationId重复请求核对、账户A→B→A隔离、R0 C09无旧lease延迟的文档接替、SPA失效、原生fixture节点与草稿保留、worker停止后IDB重新读取、宿主网页无法枚举扩展数据库。浏览器请求与页面脚本错误观察为空；不等于浏览器整个进程没有网络流量。
- R0失败的C09在本实现中由浏览器\`getFrame\`证实新document后允许接替，所记录的浏览器导航耗时属于合成fixture，不是ChatGPT路由延迟。

真实测试范围为 **REAL_CHROME_SYNTHETIC_FIXTURE**，不是LIVE_CHATGPT，不能按11/11自称产品兼容率。测试失败也保留：首次集成运行在scope标准化对象二次传递时错误丢失verified标记，导致5 PASS/5 FAIL，修复后完整10/10，再添加并发CAS验证最终11/11；另一次runner初版将Playwright的\`url()\`误用为\`url\`并直接报错，已经修复。

源码在\`src/b1\`，合成扩展构建在\`experiments/b1/fixture\`，Node与Chrome执行脚本在\`tests/b1\`。最终结果在\`docs/engineering/results\`；Playwright依赖锁文件可从\`tests/b1/tooling\`安装。

## 尚未放行与下一步

B1当前可用于继续非敏感底层工程，但仍是LIMITED而非正式账户/隐私验收：
1. 需要获准的独立真实ChatGPT合成账户，验证账户+组织witness，不能由test resolver替代。
2. 真实document/SPA/route的重连及失效、禁用/重载/冻结残留、active DOM上的原生功能保持和真实返回槽位必须另测。
3. 若准备储存敏感文本，必须先完成强化epoch与IDB事务竞态边界、存储迁移/配额/异常恢复的审计，不可直接升级。
4. B2时间覆盖纯逻辑可独立推进；真实导出/新发送、C2真实导航和PAIA真构建共存仍BLOCKED。
5. 下一合理工程可以继续B1仓库耐久性/并发回归、B4存储命令日志或在清洁环境验证真实范围；无需重设计v2.7。

**PR保持Draft，不自动合并，不把fixture复制为production manifest，也不修改其他仓库。**
