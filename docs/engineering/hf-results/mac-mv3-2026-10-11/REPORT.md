# VAIWL PR #6：Mac Chrome 真实 MV3 与正常页面集成追补（2026-10-11）

**结论：本轮合成宿主的真实 Chrome MV3 端到端集成通过；真实 ChatGPT 登录态仍 NOT_RUN。** 本结果叠加的是独立证据等级，不将云端原有 38/38 opaque DOM 结果替换、相加或改称原生 ChatGPT 通过。

## 1. 版本、环境与授权

- 直接从 PR #6 head `2867fe3190f07d410593a6e588255f3ed5047116` 的 GitHub 只读归档开始；通过隔离临时目录部署。没有修改 main、设计 PR #1、R0 PR #4、B1 PR #5 或其他仓库。
- Mac：macOS 27.0，arm64；Google Chrome 154.0.8037.99；Node 26.8.2；Python 3.14.7；Python Playwright 1.57.0。
- 唯一实际工作区：全新 `/tmp/vaiwl-hf-mv3-*` 临时目录。每次浏览器测试通过 `TemporaryDirectory` 创建全新 Chrome Profile；headless + 调试管道。没有日常 Chrome Profile、账号、Cookies、私人对话、PAIA 本体、付费模型、登录、安装或全局依赖。
- 仅在随机端口的 `127.0.0.1` 上启动本仓库合成宿主，使用其自身 `simulator/build.mjs` 构建的、只匹配测试路径的 MV3 扩展。
- 代码只修复 PR #6 已有工程的真实集成缺陷和测试驱动；不扩展为 C2 生产接管，原生聊天组件仍由合成宿主持有。

## 2. 最终完整测试账本

| 证据层级 | 当前源版本下的独立完整运行 | 证明边界 |
|---|---|---|
| Node/B1合同与合成数据 | **39/39 PASS** | 在原38个基础上新增 SPA URL 滞后的B1安全回归；不是真实账户 |
| Chrome正常URL页面模式 | **4/4 PASS** | 页面origin的正常加载、真实DOM/草稿、浏览器历史、B1再次打开；并非MV3 |
| Chrome真实MV3模式 | **8/8 PASS** | `Extensions.loadUnpacked`、页面content script/worker、原生节点往返、真实历史、worker停止/启动与扩展IDB保留、SPA A→B→A隔离、安全退让、unknown拒绝 |
| 真实ChatGPT登录态 | **NOT_RUN** | 未提供清洁账户，本轮未访问或登录 |
| 实际PAIA、disable/re-enable、freeze、物理IME | **BLOCKED/NOT_RUN** | 本轮没有合格的已执行证据 |

最终结果原件：`page-final.json`、`mv3-final.json`、`node-39.tap`。本轮所有失效前后的失败证据独立保留，不将旧失败记录改成成功。

## 3. 实测发现及修复

1. **测试CSP兼容（runner问题）**：真实宿主设置 `script-src 'self'`，原 `page.wait_for_function` 使用eval导致阻断；改为Playwright locator等待，**不放宽宿主CSP**。原失败见 `page-csp-original-failure.json`。
2. **实际扩展加载参数（runner问题）**：`Extensions.loadUnpacked` 虽返回扩展ID，但Playwright默认 `--disable-extensions` 影响content注入。显式从默认参数中移除此项，只针对新临时Profile运行；见 `mv3-extension-injection-failure.json`。
3. **首绑与worker恢复竞态（扩展缺陷）**：真实导航 `onCommitted` 通知可在新文档BIND期间撤权，返回 `invalidated-during-check`，客户端先前停留WAITING；现仅对明确的临时文档失效添加**最多3次**有限时延重试，不对未知身份/权限失败盲重试。原失败见 `mv3-worker-rebind-failure.json`。
4. **worker启动证据（runner缺陷）**：Chrome复用service worker target/version，旧Playwright Worker句柄已经失效，直接 `Worker.evaluate` 不能证明新worker未启动。添加仅允许合成fixture的只读worker启动标识和IDB记录探针；检查停止→启动→运行事件、不同启动标识、真实扩展origin已存记录及同一revision。旧失败见 `mv3-stale-worker-handle-failure.json`。
5. **同document的SPA消息源URL滞后（B1集成缺陷）**：在真正Chrome切A→B后，`MessageSender.url` 仍是A，但 `webNavigation.getFrame` 显示B，且两者 `documentId` 一致。旧broker强求两个URL相等，永久返回 `not-current-document`。修订为以**当前浏览器frame URL**判定路由，但严格核验`sender.id`、tab/frame/documentId、同源及允许路径；账户scope只由privileged resolver在确认的当前frame上解析，旧lease被拒绝；async结果前后再次复核精确当前路由与scope。原失败/两个URL证据在 `mv3-spa-stale-sender-url-failure.json`。
6. **新增回归覆盖**：Node新增同document SPA旧响应不可泄漏及跨端口不同源拒绝；真正MV3下验证A→B→A侧栏主题不串线、不安全导航边界安全退让、未知身份无派生节点。

## 4. 重现（只用于全新隔离Chrome）

```sh
node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs

# 使用新目录和项目局部venv，需安装 tests/hf/requirements.txt
python3 -m venv /tmp/vaiwl-hf-mv3-VERIFY/venv
/tmp/vaiwl-hf-mv3-VERIFY/venv/bin/python -m pip install -r tests/hf/requirements.txt

/tmp/vaiwl-hf-mv3-VERIFY/venv/bin/python tests/hf/real-browser.py \
  --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --mode page --out /tmp/vaiwl-hf-mv3-VERIFY/page-run

/tmp/vaiwl-hf-mv3-VERIFY/venv/bin/python tests/hf/real-browser.py \
  --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --mode mv3 --out /tmp/vaiwl-hf-mv3-VERIFY/mv3-run
```

上述目录/结果路径必须尚不存在；测试器内部另外创建全新浏览器Profile。运行器不会无条件降级到`set_content`。Mac之外可用其他允许MV3的Chrome，必须重新记录环境版本。云端管理员策略的原始BLOCKED报告仍是该环境下的事实。

## 5. 尚未放行

- 真实登录态ChatGPT账户/组织认证与Project权限、历史消息时间/覆盖、真正侧栏/阅读返回插槽、模型/Canvas/语音/交互回复五格功能仍未验收。
- 真实扩展禁用、重启、冻结后的DOM残留和恢复仍属此前R0已知风险，不因这轮worker stop/reload通过而解除。
- 该模拟器中的 `syntheticURL`、A/B账户和worker诊断桥只服务于合成fixture，**不是生产ChatGPT身份算法**。
- B1事务写入与路由变化并非已证明完全原子；未知/过时请求必须保持fail-closed，未来敏感数据入库前仍须独立审计。

**当前架构裁决：合成宿主真实MV3集成由BLOCKED转为GO（本次已测试场景），整个VAIWL真实ChatGPT产品仍LIMITED。PR保持Draft，不合并、不继续B2/B3或生产C2。**
