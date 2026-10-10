# VAIWL High-Fidelity ChatGPT Host Simulator

> **2026-10-11 Mac隔离环境追补：** 已在macOS27 / Chrome154真正加载MV3并验证：页面模式4/4、MV3模式8/8、Node39/39通过。云端环境原先的管理员阻塞仍是该环境下的历史事实；不是登录态ChatGPT通过。完整变更及原始证据见 [Mac MV3验证报告](../docs/engineering/hf-results/mac-mv3-2026-10-11/REPORT.md)。实际启动需从Playwright默认参数中移除`--disable-extensions`，并使用CSP兼容的locator等待。

可交互、纯合成、离线本机测试宿主。不是 OpenAI 服务、登录页或替代聊天产品。当前实现版本 `0.1.0`；设计仍以仓库 v2.7 为准，不另建产品 Canonical。

## 启动

在本 PR 的仓库根目录运行（Node 22+，运行应用不需要 npm 安装）：

```sh
node simulator/server.mjs
```

打开 `http://127.0.0.1:48173/control.html`。控制台是独立窗口，不占用宿主布局。宿主页顶端始终显示合成测试身份。服务仅监听 `127.0.0.1`，不部署到云端、不调用模型、不接受写入 API。更换端口可用 `PORT=48174 node simulator/server.mjs`。

三个运行方式必须区分：

| 方式 | 控制台入口 | 真实执行的部分 | 不能据此证明 |
|---|---|---|---|
| `native` | 原生宿主基线 | 本地消息、输入、菜单、路由、流式计时器等宿主逻辑 | VAIWL 集成 |
| `page` | 页面工程集成 | 同一份导航和 client，B1 Repository 使用真实页面 origin 的 IndexedDB；broker 使用明确的模拟 Chrome sender/frame | MV3、扩展 origin、真实浏览器身份 |
| `mv3` | 真 MV3 集成 | 已构建扩展运行同一份导航/client；worker 使用 B1 Repository 与 browser getFrame/MessageSender | 真实 ChatGPT 账户认证或功能兼容 |

云端当前 Chromium 的管理策略阻止普通 URL/loopback/file 导航和未打包扩展。**本轮 page-origin 与 MV3 集成验收均 BLOCKED。** 已运行的浏览器证据来自下面单列的 `opaque` DOM 测试；不把这个限制藏在“浏览器全部通过”之后。

## 真扩展构建与隔离运行

```sh
node simulator/build.mjs /tmp/vaiwl-hf-extension-new
```

输出目录必须不存在。生成 MV3 manifest、实际 content bundle、worker 与 B1 模块及逐文件哈希。它只匹配 `http://127.0.0.1/hf/*`；没有 `chatgpt.com`、cookies、history、debugger 或 all_urls 权限。`webNavigation` 事件也限定至合成 host/path。不要安装到日常 Profile。

在另行可用的隔离浏览器中，加载该新建目录，再从控制台打开 `mv3`。浏览器工具栏 action 可切换实验增强。只允许合成账户 A/B/unknown，测试 URL 的账户标记**不是**真实 ChatGPT 身份算法。

当前保留 B1 的 20 秒 lease：到期关闭派生投影，不使用无限心跳让 worker 常驻。页面工程模式可在宿主页的开发者控制台中运行 `HFextension.refresh()` 重新验证；MV3 可使用工具栏切换重新连接。该安全边界及未完成的自动恢复是 C 阶段仍需处理的工作，不是完整生产会话管理。实际禁用/冻结后是否残留不能用此计时器保证。

## 自动化

```sh
# 包含继承的 B1 测试和新增时间/构建/竞态测试
node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs

# 浏览器工具依赖：只安装进项目局部虚拟环境
python -m venv .venv-hf
.venv-hf/bin/pip install -r tests/hf/requirements.txt

# 真实 Chromium DOM / opaque 模式（本轮实际跑通）
.venv-hf/bin/python tests/hf/browser.py --browser /usr/bin/chromium --out /tmp/hf-dom-new

# 正常 URL + 真实页面 IndexedDB，无 opaque 降级
.venv-hf/bin/python tests/hf/real-browser.py --mode page --browser /usr/bin/chromium --out /tmp/hf-page-new

# 真 MV3：新 profile、loopback、实际加载和 worker 生命周期；无 mock fallback
.venv-hf/bin/python tests/hf/real-browser.py --mode mv3 --browser /usr/bin/chromium --out /tmp/hf-mv3-new
```

所有结果目录必须不存在。`real-browser.py` 的退出码：0=实际执行通过，1=执行断言失败，2=环境阻塞。它不安装全局软件、不修改管理员策略，不连接 Mac，也不调用 GitHub Actions。

`browser.py` 在 `about:blank` 上通过 Playwright `set_content`/脚本注入运行实际 DOM。仅测试入口 `tests/hf/opaque-entry.mjs` 注入逻辑路由、Chrome sender 和只读合成目录 test double；明确不实例化 ScopeRepository，不模拟存储成功。应用入口没有“IDB 不可用就换内存库”的后门。两种模式共用实际 `src/navigation/*`、client、adapter、host 和 B1 broker 源码。

## 场景

基线含两个独立合成身份、两个 Projects、普通聊天、固定/归档/拒绝访问、已知/未知/覆盖缺口与历史主题。默认 8 个主题、40 个窗口；压力档 120 个主题、604 个窗口，其中一个主题有 128 个窗口。长聊天为 160 个消息节点。

控制台可切换：嵌套侧栏、无安全导航边界、原生头部被动态内容占满、导航重建、原生菜单/权限层、深色、窄屏提示、压力档、A/B/unknown、时区和参考时刻、延迟/失败、长输入框、正在生成及待批准状态。真正改变 viewport 请调整窗口或使用测试脚本，不能把“窄屏”按钮视为设备尺寸验收。

真实 worker 停止、扩展禁用和 freeze 不是网页按钮能可信伪造的能力。对应驱动/未覆盖项在 `real-browser.py` 和覆盖矩阵中，不提供假的“成功重启 worker”控制。

## 实现边界

- 宿主自行拥有消息、输入、原生菜单和权限；VAIWL 不克隆它们。
- 导航插到已识别的原生聊天列表之前，未创建空白 extension slot。当前为保守的附加导航，原生聊天列表仍保留；并非最终侧栏替换验收。
- 工作区视图使用扩展自有遮罩和可撤销 `inert`/namespaced 属性，原生 transcript 不拆除。composer/header 保持原位；原生弹层出现时让出扩展区域。
- 未找到安全边界或原生头部由动态内容占满，退回 `NATIVE_ONLY`。这是测试通过的安全退让，不是宣称该变体具备全部增强。
- B1 只有一套持久仓库。主题/时间数据来自固定合成清单；展开/滚动是每 scope 的临时视图状态。没有实施完整 B2 导入器或 B3 持久化 Workspace/人工命令系统。
- 宿主新发送、编辑、分支可真实交互，但它们不会被冒充为已接通的生产消息采集渠道；不会自动更新 B2 历史证据清单。
- 原生局部重建、稳定节点和增量更新是原生 DOM 实现；不仿造 React 私有 store、真实服务端协议、虚拟化或所有业务功能。

完整结论见 `docs/engineering/HF_SIMULATOR_REPORT.md`；证据等级和失败记录见 `hf-results/`。截图与完整原始运行档案在对话交付 ZIP 中，其源码哈希与此 PR 对应。
