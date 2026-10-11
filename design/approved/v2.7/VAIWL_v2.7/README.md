# VAIWL v2.7 增量设计与原型

2026-10-11。打开 `prototype-v2.7.html` 即可体验。无安装、登录或模型配置；不发送消息，不读取真实 ChatGPT，不写浏览器持久存储。关闭或刷新页面会重置演示。

本版替代：日历月改为固定30当地日历日；右侧上下翻段，当前没有向上；主页主题标题不可折叠；旧窗口从左侧小箭头展开；阅读区只有一个四格返回工作区图标。核心以外遵循真实原生组件所有权，离线页面仍是明确的原生占位示例。

演示日期固定为2026-10-10，便于复验；可从VAIWL设置调整，不代表程序获取了当前账号的活动时间。真实来源缺少覆盖时保留未知，不能使用访问时间顶替。四套使用规模是合成设计假设，设置中的切换会重置示例修改。

先看默认主页的右侧下箭头，再点击PAIA窗口；阅读区左上角的四格图标返回先前工作区。卡片下方及侧栏列表左侧的小箭头只展开旧窗口；未知记录通过主题菜单查找。菜单中的“原生”项目是离线占位路径，不代表服务实际连通。

## 文件

`docs/CORE_FLOW_V2_7.md` 是核心增量；`docs/INTERACTION_SPEC.md` 是当前交互整合；`docs/research/NATIVE_WEB_DELTA_2026_10_11.md` 是官方网页定向补漏。状态/授权/AGENTS与本次GitHub文档一致。原A–G计划不另建副本，核心增量§8明确覆盖相关旧任务条件。

`VALIDATION.md` 说明测试范围。`test_v27.py` 可独立运行，`validation/final/` 是最终完整50项结果和截图；`validation/attempt1/`及日志保留首次完整50项结果。两次不是100项。`baseline/prototype-v2.6.html` 与精确patch保留增量来源，不是重新生成的原稿。

## 复验

需要Python、所列Playwright版本，以及本机独立Chromium可执行程序。设置 `CHROMIUM_PATH` 可指定路径；脚本不连接个人Chrome，也不加载私人profile。

```sh
python test_v27.py --html prototype-v2.7.html --output validation/recheck
```

默认Chromium路径为 `/usr/bin/chromium`。脚本仅用 `page.set_content` 加载合成页面；每项独立上下文。不要拿真实账号或私聊替换测试样本。

## GitHub交付

Draft PR #1：https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/1
本次提交：`968bb45351c2e341be4f66d6ccacb1a83311b393`。
只有六份Markdown写入GitHub；新版HTML、脚本、日志、截图是本轮对话附件，未上传为仓库运行代码。没有部署、安装、模型调用、私人聊天或其他仓库修改。
