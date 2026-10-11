# B2/B3 — 执行与证据

基于 PR6 a02d653，使用同一个 B1 数据库。当前代码没有真实 ChatGPT 数据源；只在高仿真合成宿主上运行。

## 启动与操作

```sh
node simulator/server.mjs
# 打开 http://127.0.0.1:48173/control.html ，选择 page 或 MV3 模式。
# 派生主题侧栏“管理工作空间”：创建、改名、图标、窗口归属、标题、顺序、撤销。
node simulator/build.mjs /tmp/vaiwl-b23-extension-new
```

Node 22 或以上。宿主/扩展运行时代码没有外部 npm 依赖。只在另获授权的隔离 Profile 加载打包目录；不要在日常浏览器安装。MV3 包只匹配 127.0.0.1/hf，不匹配 chatgpt.com。

## 当前可执行测试

```sh
node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs
# Python Playwright 使用已授权的项目局部环境；本次实际版本见 ACCEPTANCE。
python tests/b23/browser.py --browser /usr/bin/chromium --out /tmp/vaiwl-b23-dom-new
```

第一条包含 39 项继承检查与 65 项新增检查。29 个 repository case、5 个迁移/故障 case 明确使用 `mock-idb.mjs`；其余为算法/消息/构建/服务器合同。这是一个小型测试替身，不实现完整 IDB 标准、磁盘、跨进程调度或浏览器权限，不能当作真实数据库证据。

第二条实际运行 Chromium DOM，共 38 项继承场景和 10 项新增 B2/B3 场景。opaque 测试环境明确注入 fake router、fake sender、mock IDB。业务模块与扩展共用，但保存/重建 JS service 不证明刷新或 worker 持久化。out 目录必须尚未存在。--only 可定向诊断，完整最终验收不使用过滤。

## 必须在允许的隔离浏览器补验（当前 BLOCKED）

```sh
python tests/b23/real-browser.py --mode db --browser /path/to/approved/chromium --out /tmp/b23-native-db.json
python tests/b23/real-browser.py --mode page --browser /path/to/approved/chromium --out /tmp/b23-native-page.json
python tests/b23/real-browser.py --mode mv3 --browser /path/to/approved/chromium --out /tmp/b23-native-mv3.json
```

驱动创建临时 Profile/目录和仅 loopback 测试服务器，结束后关闭自己启动的进程。不会使用原 Profile，不访问 ChatGPT。测试 helper 服务器额外开放两个本地测试模块，正常 simulator/server 不开放该路径。

db 在真实 IndexedDB 运行相同 29 个仓库 case 与两项 native migration 检查；page 验证组件保留、真实刷新、新 tab、A/B、两连接 CAS；mv3 验证真实扩展、同类持久化、实际 worker stopped 事件和新 boot 标识，不能以 CDP 调用成功代替终止。worker 恢复触发是显式刷新合成页，不是自动重连认证。

环境拒绝写入 BLOCKED 并退出 2，不启用 fallback、不改变管理员策略；断言失败退出 1。此驱动在当前云端只做语法检查，native 运行没有 PASS 结果。环境拒绝原始记录在 docs/engineering/b23-results/environment.json。

## 数据安全和恢复

`WorkspaceRepository` 接收 baseRepository，不能创建自己的数据库。原生数据没有写入命令。普通消息不接受 INGEST、actor 或 scope。合成来源只在内部隔离 provider 注册，不是“trusted:true”标签。

新数据库 version2 与旧 v1-only 代码不可假定向后打开兼容。损坏时正常写入被拒绝；维护端可调用 recoveryStatus/recover，必须检查 damagedHash，并接受可能回到上一个 checkpoint 的数据损失。不要删库或重播 bootstrap 代替恢复。详见 docs/engineering/B23_IMPLEMENTATION.md。

原始测试结果（包含失败）见 `docs/engineering/b23-results/RAW_RESULTS.tar.gz`，最终 DOM JSON 另有同目录明文副本。解压后文件名与失败账本一一对应；全部哈希见 SOURCE_MANIFEST。
