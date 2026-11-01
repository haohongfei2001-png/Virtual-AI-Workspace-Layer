# PR16：单一候选与最小 Mac 状态验收

远程源码与测试负责人保持唯一 writer。候选的完整提交 SHA 和同 SHA CI 由 PR16 最终交接评论钉定；本文件随该候选提交，不为补写 CI 结果产生第二候选。此前 `30d4cba74854f1a5dfe1e23e6295047cba602976` 及其失败/通过证据保留为历史。

## 原 Codex 仅需完成的操作

1. 从最终评论所钉 SHA 准备 BrowserLocal 包，核对下列包哈希；保全原 Profile、备份、stash 和私人数据，按已有同 ID 更新流程更新并激活原注册目录。原扩展 ID 为 `miendbcjdmecjggplepenghjnoejmaic`；不卸载或换 ID。仅为本候选激活创建必要的新文档，不重跑全套旅程。
2. 仅使用原专用 Project 标签。保持该标签为目标，打开一次 VAIWL 自有状态面板；验证其根属于该 ID 的精确 `chrome-extension://miendbcjdmecjggplepenghjnoejmaic/status.html`。
3. 直接读取“本次诊断”四个默认可见字段。**不展开 details，不定位/点击 summary，不读取 Project DOM，不读取折叠 JSON，也不点击结构、历史、解锁或重连按钮。** 稳定 ID 未暴露时可在唯一自有面板根中按下表的精确文本前缀匹配唯一节点；不得扩大到宿主内容。一次无法取得即报告实际缺失，不用旧快照补值或循环重开。

| 固定 ID | 固定文本前缀 | 应回传内容 |
|---|---|---|
| `runtime-build` | `运行指纹：` | 完整64位指纹，或实际未核实信息 |
| `boot-stage` | `启动阶段：` | 实际 module-loading/module-loaded/module-load-failed，或缺失/身份变化信息 |
| `status-code` | `本次状态码：` | 完整固定状态码及已有本地检查分类 |
| `mount-stage` | `挂载诊断：` | 当前 mode/attempt、boundary及Project阶段、mountFailure、layoutRefusal，或实际未就绪/未提供信息 |

正式 BrowserLocal 运行指纹：

```text
26a6145413a9db5acdfdc57e7643bea119c33fd5623216d1b437727ec2eaea30
```

开发ZIP SHA256：`d4a7a553293f8ddac70bcdb961b165059ce3ea61763eba0f285840cb993685c8`。使用冻结源码和锁定依赖执行 `node extension/package.mjs --browser-local <全新暂存目录>`，再执行 `node extension/package.mjs --verify <全新暂存目录>/extension`；不是加载第二个目录产生新扩展身份。正式包205文件、206项生产输入，权限仍为 `webNavigation` / `storage`。离线旅程使用127.0.0.1配置，其运行指纹与正式包不同，不能拿离线指纹验收Mac。

## 回执与工程归属

回执只需记录候选SHA、扩展ID一致性、四个字段原值及是否默认可读；不包含私人URL、documentId、账号、标题、正文、输入或资产。拒绝字段中的`null`表示本次未记录该项拒绝；`presentation=null`表示控制器未就绪，缺字段为“未提供”，均不证明通过。`module-loaded`只证明模块加载；运行指纹不符或未核实不能认证新候选。

如果当前 `status-code` / `mount-stage` 明确显示 Project 挂载拒绝，远程唯一 writer 继续在原 PR16 复现、修源码、补反例并验证。Codex 不接管可在 GitHub 完成的源码/测试任务，也不继续修 AX 展开工具。只有固定状态不足以确定实际原因时才由远程负责人指出具体证据缺口，不能猜改 selector/paint/grant。

本轮不追加原36/36结构额度，不新建竞争PR、不合并或发布。固定摘要已在隔离真实Chrome MV3中验证；原Mac本候选仍为 NOT_RUN，真实Project挂载仍 NOT_VERIFIED，FREE_NOT_ACCEPTED / NOT_RELEASE_READY 保持。
