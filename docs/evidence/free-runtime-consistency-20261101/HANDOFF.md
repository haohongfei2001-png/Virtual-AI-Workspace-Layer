# 原 Mac：单一候选的一次性最小复验

本指令仅在 PR16 最终交接列明本提交的精确 SHA 与同 SHA CI 成功后执行。远程 Pro 仍为唯一源码/测试 writer；Mac/OpenCode不修改或推送生产分支。保持Draft，Free NOT_ACCEPTED / NOT_RELEASE_READY。

## 候选与准备

使用PR16交接唯一冻结SHA生成或提供的正式BrowserLocal包；不要使用loopback/诊断配置。构建命令为 `npm ci --prefix extension/tooling --ignore-scripts --no-audit --no-fund`，然后 `node extension/package.mjs --browser-local <全新暂存目录>`。本次打包及修复已由远程完成，Mac不承担源码研发。

- 原ID：`miendbcjdmecjggplepenghjnoejmaic`。
- 包内208文件完整性验证：`node extension/package.mjs --verify <暂存目录>/extension`。
- ZIP SHA256：`16d778f68beaca0b301c147e198858c7372388d73a90a39f86580a8a12c8fdd6`。
- 唯一预期运行/登记指纹：`f6fc3d01276442ef1b956af81ce7b56313c7a39fd43ae717f7db2f4dc99ff430`。

沿原已授权备份和同ID更新流程，仅把该208文件写入原登记路径，保留原历史额外文件、备份和私人数据；不另载新目录、不卸载、不变更Profile。文件总数以实际集合为准，不能假定Mac额外文件与新增3路径一定不重叠。不得把“磁盘哈希正确”当作运行激活证明。

## 唯一一次激活与读取

1. 仅由Mac验收方对原ID执行一次单扩展Reload。等待扩展卡片结束重载且仍为启用，记录Reload是否有完成证据；单独AXPress成功不足以记完成。不得重启Chrome、批量刷新、触碰其他扩展或重试Reload。
2. 在读取Project前，若既有许可工具能在**VAIWL自有popup/Worker上下文**执行只读表达式，仅取 `({id:chrome.runtime.id,registered:chrome.runtime.getManifest().version_name??null})`。这不接触宿主DOM、标题、账号、输入或项目正文。不在ChatGPT页面执行，不扫描Profile文件；不得为此扩大工具权限。无法取得记NOT_READ。登记指纹若已明确不符，立即停止后续Project操作。
3. 在Reload完成后，仅新建一个专用Project文档；不刷新旧工作标签。页面加载完成，确认原ID popup与当前活动目标绑定后，只打开一次VAIWL面板。
4. **先核对runtime-build完整64位值。** 不同、缺失或无法读取立即停止，`boot-stage/status-code/mount-stage`均记NOT_READ，不追加Reload、结构检查、解锁或重连。
5. 仅在完整指纹完全相同后，于同一popup读取默认可见的 `boot-stage`、`status-code`、`mount-stage`；不展开结构工具，不读取Project DOM。若状态仍为版本/登记未核实，不接受为正常候选；将实际固定码返回。

登记读取是本次唯一额外的最小事实，用来区分“登记未换代”和“登记已换代但新文档仍执行旧入口”。若工具不可读登记但BOOT正确，新popup自身的登记门仍会拒绝不一致；不得通过推测补齐登记值。任何指纹失败均保持停止，不继续读挂载诊断。

## 回执格式

```text
candidate-sha: <PR16冻结完整SHA>
installed-package-sha256: <实际核对值>
extension-id: <实际值>
reload-count: 1
reload-completion: OBSERVED / NOT_CONFIRMED（只写固定结论）
registered-build: <64hex / null / NOT_READ>
new-document-after-reload: YES / NOT_ESTABLISHED
popup-target-binding: VERIFIED / NOT_ESTABLISHED
runtime-build: <原样64hex或固定错误>
boot-stage: <仅指纹通过才读，否则NOT_READ>
status-code: <仅指纹通过才读，否则NOT_READ>
mount-stage: <仅指纹通过才读，否则NOT_READ>
project-dom-budget: 36/36 UNCHANGED
```

无需回传URL、标签标题、Project名称、账号、聊天、输入或截图。如果指纹正确且挂载仍拒绝，由Pro沿实际固定拒绝码继续修复生产源码；Mac不猜修、不竞争写入。通过版本门只恢复Project挂载验收入口，不等于Project/Free已验收。
