# VAIWL — Virtual AI Workspace Layer

在原生 ChatGPT 旁工作的可逆语义工作空间层，按已批准 v2.7 设计与原 A–G 路线实施。当前工程运行范围是独立合成宿主和全新隔离 Chrome MV3；生产 ChatGPT resolver 保持关闭，尚无面向真实账户的安装/发布交付。

## 正式依据与实际状态

- [实际 A–G 状态](docs/STATUS.md)、[授权边界](docs/AUTHORITY.md)、[完整原计划](docs/DEVELOPMENT_PLAN.md)、[执行约束](AGENTS.md)。
- [v2.7 Canonical](docs/CORE_FLOW_V2_7.md)、[交互规格](docs/INTERACTION_SPEC.md)、[原生保留](docs/NATIVE_FEATURE_PRESERVATION_V2_6.md)。
- [原批准 v2.7 原型/效果图原件](design/approved/v2.7/VAIWL_v2.7/)、[导入与哈希](design/approved/v2.7/IMPORT.json)。历史 v1–v2.6 文件保留为档案，非当前执行基准。
- [本轮连续实施报告](docs/engineering/CONTINUOUS_FINAL_2026_10_12.md)、[持久恢复检查点](docs/engineering/CONTINUOUS_CHECKPOINT_2026_10_12.md)、[最新真实截图](docs/engineering/f1-mac-2026-10-12/final-journeys/c1/)。

## 当前体验与工程范围

一个主题一张主页静态卡片，活跃窗口直接可见，旧窗口在父主题左侧局部展开。按最近可靠用户新发送独占固定30个当地日历日段；当前段无向上，历史段连续相邻切换，未知不伪装历史。侧栏主题可折叠，阅读区一个无字工作区返回；原生输入/消息/模型/工具/Project与浏览器历史不被替代。

同一扩展IndexedDB保留人工名称/图标/顺序/归属，CAS、幂等、冲突撤销、20秒lease自动重连与多标签页保护。B5增加资产文件备份、只读dry-run、最新人工修改的安全检查点+日志恢复及损坏/配额反馈；工作集与用户选中片段复用人工资产和原生导航，不后台收集正文。

C1设计一致性修复在Draft [PR #9](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/9)，B5在stacked Draft [PR #10](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/10)。C3–C5、D离线与F1后续增量已本地提交，普通Git端点故障导致尚未远端交付；详见检查点。没有合并main或发布。

本轮最终135 Node、54原生IndexedDB、49 DOM（mock层单列）、页面/MV3与真实UI/worker旅程通过，120主题/604窗口不缩水。F1 1k/10k实测通过，100k容量仍BLOCKED；D的1200模板合成样本不是98%/90%产品质量认证。真实ChatGPT/PAIA/真人发现性/物理IME、原生写入/同步/付费渠道需独立授权或证据，不拿合成测试冒充。

## 本地验证

专用隔离 Python 环境依赖见 tests/requirements-local.txt；Node测试和各驱动命令原件在最终报告所链接的commands.json。`python3 tests/f1/verify-evidence.py`只校验最新源码/结果/原件hash，不启动浏览器或改数据。实际浏览器驱动使用全新headless Profile、127.0.0.1合成宿主及仅本次实例的CDP，不能连接日常Chrome或真实ChatGPT。
