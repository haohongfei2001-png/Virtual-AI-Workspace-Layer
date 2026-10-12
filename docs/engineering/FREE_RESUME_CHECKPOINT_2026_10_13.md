# Free实施恢复检查点

用户于2026-10-13要求停止领取新任务，完成现有测试、提交已有代码并暂停Goal，准备从Codex桌面应用接续。本文件不是新计划；只记录DEVELOPMENT_PLAN当前切片的可恢复状态。

## 仓库与权限

- 工作区：`/Users/hhf/Documents/Codex/VAIWL-Development/free-first`。
- 分支：`codex/vaiwl-free-first-20261013`；基线`176ebc9a3620f6e174e542e3320ff7008cd6ebe8`。本次实现是包含此检查点的本地提交，可用`git log -1`核对实际SHA。
- 已读取远端PR #15：Draft，分支`docs/vaiwl-v28-core-mechanisms-20261012`，head与基线一致。未修改父PR、main或历史证据；本实现未推送且尚无Draft PR。
- 原有持续开发许可仍限定本地及隔离合成Free。私人ChatGPT、PAIA、真实原生写入、收费、部署、强推、合并均未授权。
- 用户暂停指令优先：读取本检查点本身不构成自动恢复许可。Goal状态由本线程暂停工具确认；恢复时保留完整原目标。

## 已有实现

`src/data/native-facts.mjs`提供严格原生观察合同、三态成员、来源版本/期限、scope检查及持久撤权。仅支持synthetic，页面字段不能认证production；相同来源迟到revision、不同generation或已撤权来源拒绝。分页未出现不删除已有记录，也不创造时间覆盖。

`src/data/free-projection.mjs`只从原生事实建立卡和原名行，不读取Workspace/Placement/Identity。明确无项目进入NONE；没有成员见证或见证过期进入UNKNOWN。当前scope的旧引用可由`knownState`保持UNKNOWN入口，不将旧null迁成NONE、不显示未经重验的旧标题。已撤权/明确不可用的来源或对象不曝光。

`src/data/native-repository.mjs`复用ScopeRepository同一IDB连接。schema升为3，新增`native_states/native_operations`，现有B1/B23与F1分片保持不变。新写入使用CAS、校验和、原子receipt及binding前中后栅栏；缺根但存在marker视为损坏，不能静默重建。新原生事实当前是20k行/16Mi有界单根；不是100k分片实现。

`simulator/native-seed.mjs`从合成宿主自己的Project/聊天清单提供显式观察，未从虚拟Workspace反推。service新增原生仓库，broker新增只读`B23_FREE_SNAPSHOT`，拒绝页面传scope或source authority，读取后仍重验当前身份。604个合成引用中603个可用、1个明确不可用；卡只有2个真实合成Project，不是120个虚拟主题。

UI尚未切换到Free，既有Pro路径仍保留。不要把纯投影和broker就绪误写成C1.F1全部完成。

## 本次最终测试

```sh
node --test tests/b1/broker.test.mjs tests/b23/*.test.mjs tests/b4/*.test.mjs tests/f1/*.test.mjs tests/hf/*.test.mjs tests/free/*.test.mjs
```

180通过、0失败、0跳过；这是本轮最终组合回归，包含逻辑、Mock IDB和构建检查，不是180条真实浏览器旅程。运行日志暂存在`/private/tmp/vaiwl-free-node-tests.log`，临时文件不作为唯一长期证据。

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vaiwl-free-playwright node tests/free/native-browser.mjs docs/engineering/free-contract-native-idb-2026-10-13.json
```

7通过、0失败；真实Chrome Headless Shell 156.0.8078.4，真实IndexedDB，独立临时浏览器profile、loopback合成页面；不使用用户Chrome配置。原始报告包含源码SHA-256，路径为`docs/engineering/free-contract-native-idb-2026-10-13.json`。nativeUI和realChatGPT均NOT_RUN。

测试依赖在`tests/b1/tooling/node_modules`，由既有lockfile安装，已加入`.gitignore`。如桌面应用环境缺依赖：`npm ci --prefix tests/b1/tooling --ignore-scripts --no-audit --no-fund`。headless shell在临时目录，可能被系统清理；仅必要时按既有Playwright工具安装。初次npm缓存写入与macOS MachPort沙箱均失败，工具升级权限后成功；未修改系统权限或npm缓存所有权。

## 明确剩余内容（未启动新任务）

继续原B2.F1+B3.F+C1.F1：将现有navigation/侧栏/查找/新建语境接到Free投影，补NONE/UNKNOWN紧凑列表及原生名称的完整UI路径。保留原生输入、工具和搜索，不能通过复制聊天实现。需要对应合成浏览器DOM/MV3证据。

同切片后续还需新事实分片、增量版本同步、恢复检查点/备份边界、持久native引用与既有共享工具的一致性；当前新事实和旧B23共享同库但分别修订，不能把旧B23引用的Project字段当最新Free事实。原生来源generation替换/重新授权策略尚未实现，当前拒绝已撤权sourceId重新写入。

随后仍按原计划推进活动事实/ObservationHint/ActivityDecision、有界校准、历史/H策略、生命周期、性能与兼容性。它们未在本检查点实施。真实宿主、跨设备及PAIA验收仍受授权/环境阻塞；不得将当前合成证据计为FR真实验收或Goal完成。

## 接续时核对

按STATUS → AUTHORITY → CORE_MECHANISMS_V2_8 → DEVELOPMENT_PLAN读取，再核对Git HEAD/工作树、本报告的源哈希与实际测试。已有文档中的“本轮仅文档”是176ebc9a以前的历史轮次；本线程实施授权和随后暂停指令见STATUS与AGENTS。不要为接续重建数据库、重写产品计划或重跑已通过且源码未变的全部测试。

此检查点没有活跃测试进程、开发服务器或浏览器需要接管；当前测试已结束，headless脚本已关闭浏览器和本地server。
