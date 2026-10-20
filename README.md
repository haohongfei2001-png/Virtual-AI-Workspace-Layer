# VAIWL — 原生工作空间Free，智能组织Pro

Free-first / Pro-later 已确定。Free将真实ChatGPT Project及其原名/实际成员映射成已设计的工作空间，并完整显示无Project原始聊天；活跃准确、旧项自然下沉、资料不完整时仍可操作、原生能力不受损和安全恢复，是第一交付目标。

Pro在Free之后保留AI虚拟归类/命名、Series、拆合和人工纠错等完整路线，不改原生归属，关闭后仍能回到原始Free。两个产品共用事实、数据和组件，不是两个聊天客户端。

## 唯一正式工作入口

- [完整A–G执行计划](docs/DEVELOPMENT_PLAN.md)：Free任务顺序、依赖、验收、持续执行和Pro接管。
- [实际状态](docs/STATUS.md)、[权限与文档效力](docs/AUTHORITY.md)、[执行约束](AGENTS.md)。
- [核心机制](docs/CORE_MECHANISMS_V2_8.md)、[功能分级](docs/FREE_PRO_PRODUCT_SCOPE.md)、[交互](docs/INTERACTION_SPEC.md)。
- [数据模型/迁移](docs/DATA_MODEL.md)、[技术架构](docs/TECHNICAL_ARCHITECTURE.md)、[安全/恢复](docs/PRIVACY_SAFETY_RECOVERY.md)。
- [Free/Pro验收矩阵](docs/research/FREE_PRO_ACCEPTANCE.md)、[基线与旧任务映射](docs/research/V28_BASELINE_AND_ACCEPTANCE.md)、[文档检查](docs/research/V28_DOCUMENT_VALIDATION.md)。
- [Pro算法与质量](docs/AI_NAMING_EVALUATION.md)仅后续；[原v2.7原型](design/approved/v2.7/)只作批准视觉与历史证据。

## 当前交付状态

Free运行时正在原目录和 `codex/vaiwl-free-first-20261013` 分支持续实施，交付沿用 Draft [PR #16](https://github.com/haohongfei2001-png/Virtual-AI-Workspace-Layer/pull/16)。已有原生数据存储、Host观察与授权、双框架导航、工作集、片段、备份恢复及隔离MV3测试；最新完成项、源码对应证据与阻塞见[实际状态](docs/STATUS.md)，不以旧文档基线代替当前代码。

**Free尚未完整验收，开发包为 `NOT_RELEASE_READY`。** 默认Host包的真实ChatGPT上下文选择仍为 `UNVERIFIED_FAIL_CLOSED`，不能当作已支持私人账户的成品。离线包只验证loopback重建宿主，不能证明真实ChatGPT适配完成；100k/4x冷启动和完整扩展BFCache等缺口仍按STATUS保留。不要为验证开发包访问私人ChatGPT或执行真实原生写入。

### Host开发包构建与校验

在仓库根目录执行，输出目录必须尚不存在：

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix extension/tooling
node extension/build.mjs /private/tmp/vaiwl-host-unpacked
node extension/package.mjs /private/tmp/vaiwl-host-package
node extension/package.mjs --verify /private/tmp/vaiwl-host-package/extension
```

构建工具通过 `extension/tooling/package-lock.json` 固定 esbuild 版本；构建过程不会自行联网安装依赖。worker 先执行小型 classic bootstrap 注册现有监听，再加载私有 runtime bundle。

每个 Host 包随附按构建类别标注的中文 `README.txt`，覆盖安装、权限与隐私、同 ID 升级、兼容性回退、备份范围和停用卸载。源文见 [Host 包使用说明](extension/README.txt)；这不是发布验收或扩大真实账户授权。

`build.mjs` 生成可加载目录；`package.mjs` 另生成 `extension/`、开发ZIP及 `SHA256SUMS`。`verifyHost` 检查文件哈希、权限与打包边界，并从包内源码重新编译核对 worker 字节，不代表功能或发布验收通过。CLI 的单路径参数用于新建包，`--verify <已有解压目录>` 只读校验，`--help` 显示用法；未知或多余参数会拒绝，不隐式创建目录。不支持 `--offline` 参数，原 `verifyHost` 函数接口继续保留。

离线构建由测试脚本调用 `packageHost(output, {offlineOrigin})`，仅接受明确的 `http://127.0.0.1:端口` origin；片段重建配置 `offlineSnippets: true` 也仅允许离线包。实际包测试入口包括 [Host MV3旅程](tests/host/package-mv3-browser.mjs)；应使用独立headless测试环境，不加载到用户日常浏览器配置。

[simulator说明](simulator/README.md)及其构建工具保留，服务于合成数据、旧Pro兼容和规模回归；它与 `extension/` Host开发包的证据边界不同，不能用模拟器通过代替真实Host验收。
