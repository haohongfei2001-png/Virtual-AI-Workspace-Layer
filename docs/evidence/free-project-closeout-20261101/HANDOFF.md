# PR16：单一候选与一次 Project 当前拒绝回执

本文件是原唯一计划的候选交接，不另建开发路线。精确候选SHA及同SHA正式CI结果由最终PR评论固定；它必须是包含本文件、receipt.json及全部本轮源码的同一提交。Pro仍为唯一源码/测试writer；Codex只负责获准的Mac安装、交互和验收。

## 已完成的远程工程

SOURCE_FIXED / OFFLINE_PASS：Project第一拒绝阶段完整传递；预挂载失败可见；旧路由回执拒绝；成功恢复清除匹配旧错误；未知启动/挂载异常留下固定阶段码；Project成员要求唯一双向tab/panel关系，关系改变撤回成员优先权而保留安全导航。未放宽任何准入或预算。

初批Node425/425、Project匿名浏览器13/13、成员导航37/37及ab022fa同SHA42项CI通过。随后根治默认status页附带侧栏采集：独立HOST_LOCAL_PRESENTATION仅返回已有状态，结构采集改为明确单次按钮；4项修前反例失败，修后相关209/209通过。最终正式打包MV3连续旅程35项记录及显式侧栏采集/导出8项记录通过。修前失败和原本能通过的flow挂载都在receipt.json中保留；不能由该夹具宣称Mac的frame=0已修复。最终独立只读审查无剩余阻断。

包：`node extension/package.mjs --browser-local <NEW-output-directory>`；使用仓库锁定的extension/tooling依赖。`node extension/package.mjs --verify <unpacked-extension-directory>`应验证205文件。

- ZIP SHA256：`7d7fbb4ad891d587153a10d0ea7141221bd55c8e697d499e243a04ede222ecc0`。
- 当前文档content运行指纹：`11f5bcbca4838be9001858e0fbdcc6933d8ebf0b160d6a9d882c2fb840c25d6b`。
- 206生产输入已与实际打包旅程、最终包和源码逐项相等。磁盘包或HEAD不能替代运行文档指纹。
- 不增加权限、test profile或诊断专包。原manifest/注册路径/ID保持；原Mac尚未安装本候选。

## 唯一的新证据需求：待用户授权，当前 NOT_RUN

**36/36结构额度已耗尽，本文件不是执行许可。** 不自行刷新/重装/claim受测标签，不重置额度，不重复原入口与成员扫描；尚余原生动作也不能代替读取许可。

申请的最小范围是：在用户批准的一次同ID候选激活窗口中，保持原Profile、注册路径及扩展ID和既有私人数据/备份；通过已经证明的原生入口进入既有Project主页，打开一次现有扩展私有 `status.html` 面板，仅回传同一当前文档的下列既有状态。若当前文档不匹配构建或检查期间改变，记NOT_RUN/不匹配并停止，不自行循环重试。更新须按原保全流程先核一致备份，不删除旧副本、stash或未提交STATUS。

```json
{
  "boot": {"build": "expected fingerprint above", "stage": "fixed stage"},
  "state": "fixed current status code",
  "presentation": {
    "boundary": {"phase": "initial or presentation", "reason": "fixed reason", "key": "fixed boundary or null", "projectStage": "optional fixed Project stage"},
    "mountFailure": "fixed code or null",
    "layoutRefusal": "fixed code or null",
    "mode": "workspace or reading",
    "attempt": "existing presentation stage",
    "registered": false,
    "frames": 0,
    "grants": 0,
    "workspace": null,
    "sidebar": null,
    "returnPresent": false
  }
}
```

以上是字段模板，数值不是本候选实测。boundary或presentation可为null；projectStage只在对应Project/几何拒绝时存在。直接使用面板的当前状态码、当前文档启动回执及`local-layout-shape`里的presentation，不读取页面正文、标题、输入值、账号、消息/分支、href列表、DOM树或新几何。普通打开默认只用HOST_LOCAL_PRESENTATION，不触发侧栏或历史结构采集；只做一次观察，不点击“读取一次匿名侧栏结构”“执行一次匿名列表观察”或导出按钮，不启用首次主区专包。面板已有的documentId/URL前后检查继续成立，不在评论中回传真实URL或标识符。

## 回执如何决定后续源码工作

| 当前结果 | 允许得出的结论 |
| --- | --- |
| `boundary.reason`与`projectStage` | 指明已执行的原生合同或几何/绘制拒绝阶段；仍需按具体分支判断，不能由一个码猜完整祖先结构。 |
| `mountFailure` | adapter已接受后的现有flow预挂载拒绝；不能与原生结构不符混为一谈。 |
| `layoutRefusal` | 已有活动布局复核拒绝；保留原生控件及paint边界。 |
| `state`中的固定启动、登记、grant、frame或撤权码 | 生命周期或授权阶段；若presentation已撤场可为null，不拿历史startup代替。 |
| 框架身份被替换 | 证明框架身份异常；不单凭此归责某个扩展，不清srcdoc。 |
| 正常frame/grant与返回入口 | 当前呈现状态；仍不等于完整Project交互或Free终验。 |

取得这一个回执后，源码定位/修复继续由Pro承担。若未获授权或无法取得，保持BLOCKED，不要求Codex重新开展整轮Mac取证。正向NONE与新增片段分支/正文来源仍缺真实语义，本项请求不扩展到它们。

## 后续集中终验的精确回归范围

只有实际Project阻断解除且获准开展集中终验后，才执行Project→既有成员→原生阅读/输入→四格返回工作区的连续链，核同一草稿/原生控件；再沿原已经准备的Worker恢复、新文档锁定及本人旧资料确认关口集中验收。无需重新证明已通过的普通聊天第一次四格点击或重做36项结构检查。本批未执行任何上述Mac步骤，个人日用、完整Free和发布均未接受。
