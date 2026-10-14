# Virtual-AI-Workspace-Layer

**VAIWL：面向 ChatGPT 原生 Project 与聊天的工作区。**

VAIWL 希望把分散的原生项目和聊天整理成清晰、可回溯的浏览器扩展工作空间：保留原生名称与实际归属，让无 Project 的聊天同样容易找到，并在工作区导航与原生阅读、输入之间自然切换。

## 当前状态

**开发中，尚未发布：`NOT_RELEASE_READY`。Free 尚未完成完整验收。**

- `main` 当前仅承载项目首页说明；完整开发代码、测试与文档位于 [`codex/vaiwl-free-first-20261013`](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/tree/codex/vaiwl-free-first-20261013)。
- 当前实施入口是 Draft [PR #16](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16)，其 base 为计划 [PR #15](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/15) 的分支；两者尚未合并到 `main`。
- 默认 Host 开发包的真实 ChatGPT 上下文仍以 `UNVERIFIED_FAIL_CLOSED` 处理，生产元数据、发送与 ACK 确认链路尚未完整启用。
- 现有离线测试、合成页面、真实浏览器 / IndexedDB / MV3 测试各有证据边界，不能据此认定已适配真实 ChatGPT 或可供日常使用。

本页核验日期：**2026-10-15（北京时间）**。最新实现、失败项与验收证据以开发分支的 [STATUS](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/STATUS.md) 为准。

## 产品方向

### Free：原生工作空间优先

- 项目卡对应真实 ChatGPT Project，显示原生名称和实际成员。
- 已确认无 Project 的聊天保持独立、可达；归属未知与无 Project 分开处理。
- 按活动与时间范围组织当前及历史内容，支持搜索、工作集和用户手选片段。
- 导航时保护未发送草稿，保留原生模型、工具、文件、输入与阅读入口。
- 通过本地持久化、备份和恢复保护人工资产，并隔离不同账户 / 上下文的数据。

### Pro：完整 Free 之后的智能增强

后续路线保留 AI 虚拟归类与命名、Series、智能拆合及人工纠错等能力。虚拟组织不改写原生归属，已有人工资产继续保留；这些是后续开发目标，不代表已经交付。

## 已有实现与剩余工作

开发分支已包含原生事实与成员三态模型、工作区 / 侧栏导航、搜索、草稿保护、工作集、片段、持久化与备份恢复，以及活动证据和 Host 授权 / 生命周期相关实现。部分路径已在隔离的离线重建宿主及真实浏览器中验证。

距离可用版本仍需完成：

- 真实宿主的账户 / context、元数据来源与发送 ACK 全链路，以及首次发送和新聊天的可靠关联。
- 完整离线验收与 J1–J4 旅程；已记录的阅读态即时点击 / 退出问题仍未完全解决。
- 大规模冷启动与性能验收；100k / 4× CPU 场景仍存在失败，不能用局部优化替代整体达标。
- 获准真实账户、真实跨端、PAIA 共存、物理 IME、目标设备及真人日常使用验收。
- 发布前的完整证据核对与交付关口。

详细完成项和待办均维护在既有正式计划与 STATUS 中，本首页只作入口。

## 代码与文档入口

以下链接均指向实际开发分支，避免在 `main` 打开不存在的文件。

| 入口 | 内容 |
| --- | --- |
| [开发代码](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/tree/codex/vaiwl-free-first-20261013) | 当前源代码、扩展、模拟器和测试 |
| [开发分支 README](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/README.md) | Host 开发包构建、校验及离线测试说明 |
| [实际状态 STATUS](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/STATUS.md) | 当前实现、原始证据、失败项与验收边界 |
| [正式开发计划](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/DEVELOPMENT_PLAN.md) | 唯一 A–G 路线、Free → Pro 顺序、依赖与完成标准 |
| [Host 规格与验收附件](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/tree/codex/vaiwl-free-first-20261013/docs/specs/chatgpt-host) | VA-HOST/1.1 FINAL、类型合同、离线验收和实施交接 |
| [Free / Pro 产品范围](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/FREE_PRO_PRODUCT_SCOPE.md) | 功能分级与共享底座 |
| [交互规格](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/INTERACTION_SPEC.md) | 工作区、侧栏与原生阅读 / 输入的交互约束 |
| [安全与恢复](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/blob/codex/vaiwl-free-first-20261013/docs/PRIVACY_SAFETY_RECOVERY.md) | 数据隔离、人工资产与恢复边界 |

## 开发与验证

开始前请切换到上述开发分支，先读该分支 README、正式开发计划与 STATUS。Host 构建产物仍是开发包；哈希或打包校验通过仅证明对应打包检查，不代表功能、真实宿主或发布验收完成。

离线验证应使用独立测试环境和明确的 loopback 重建宿主，不加载到日常浏览器配置，不以私人账户或真实原生写入替代尚未完成的验收。模拟器与 Host 开发包的结果分别记录，不互相替代。
