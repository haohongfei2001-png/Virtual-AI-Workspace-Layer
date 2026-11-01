# 未来 Mac 一次首拒取证：本轮禁止执行

## 启动前提

必须先取得用户后续对**这个新批次的一次真实 Project 取证**的明确授权，并确认候选精确 SHA 的正式 push CI 全部 42 jobs SUCCESS。当前 `LIVE_NOT_AUTHORIZED`；此文档、诊断构建选项、原工程权限和旧已消费额度都不构成实机授权。

沿原 Profile、原扩展 ID、原安装路径和现有数据。不能删除/重置旧 36/36、Project 1/1 或新批次 spent 记录；不能重放旧离线脚本、DOM 投影、Proxy 或手工第二次调用 captureNativeBaseline。

## 准备冻结候选

从 PR #16 取得最终候选 SHA，在原工作树安全快进到该 SHA；若有竞争修改或无法快进，先保全，不 reset/clean/强推。不要覆盖 `.git/vaiwl-artifacts/mac-wrapper-first-refusal-20261102/offline-repair-v2/`。

在未使用的新 staging 目录构建（下面输出路径必须不存在）：

```bash
npm ci --prefix extension/tooling --ignore-scripts --no-audit --no-fund
node extension/package.mjs --project-wrapper-diagnostic .git/vaiwl-artifacts/mac-wrapper-first-refusal-20261102/formal-candidate
node extension/package.mjs --verify .git/vaiwl-artifacts/mac-wrapper-first-refusal-20261102/formal-candidate/extension
```

这是待明确授权的专用诊断包；普通 `--browser-local` 包默认不启用本功能。生产诊断包应为 210 文件，静态执行图、登记 manifest.version_name 与 BOOT 的预期指纹相同：

```text
78eb96f530fac97a2a8928663c0bd24568f9f684bda6e92a1edfa5cae501f902
```

本地已验证 ZIP SHA-256：`39dbecf586c8f390e623632d409dfd51f17fa60cec65aad86f6bee6d6237e336`。若跨环境归档字节不同，先核验 build-manifest 的 210 个源码输入及正式指纹，不改预期值或绕过验包。之前确认的 `f6fc3d01…f430` 是父候选，不能当新诊断包的预期指纹。

## 一次实际操作

1. 在后续授权范围内完成原目录/数据保全和同 ID 更新，仅一次有效 Reload。随后只使用指定真实 Project 的新文档；不要刷新循环或复用旧运行文档。专用包此时等待授权，尚未运行 HELLO 或原生挂载检查。
2. 以该 Project 为当前目标打开扩展自有 `status.html`，核对登记指纹与 BOOT 均为上述指纹且 module-loaded。版本或 document 绑定不符立即停止；不读取正文、标题、输入、附件或私人网络来补证。
3. 在文档等待窗口 60 秒内展开一次“诊断详情”，只点击一次 **“已获授权：执行一次 Project 首拒取证”**。按钮先持久消费新批次许可，再让该文档当前会话继续原正式 Host 流程。原身份和授权检查仍可能拒绝。
4. 等待这一次结果，内容门最长 30 秒，私有 UI 消息总期限 35 秒。只保存按钮提供的 `vaiwl-project-first-wrapper-refusal.json`，回传该 JSON、候选 SHA 和“单次授权是否已消费”。导出操作只保存已有缓存，不重新扫描。
5. COMPLETE、PARTIAL、NO_MATCH、FAILED、EXPIRED、INVALIDATED 或没有回执，都结束本次操作。不得再次点击、刷新、重建文档、删除 key 或换通道补采。PARTIAL 原样交回；不补造缺失字段，不扩大祖先数或时间预算。

新门只存 `{spent:true}` 于 `vaiwl-project-first-wrapper-refusal-20261102-v1`，报告仅留当前文档/会话 RAM。再次打开状态页不会再次采集；30 秒期限或路由/文档/代次失效后旧成功回执不再被当作当前有效证据。保存应在第一次响应后立即完成。

回执用于决定后续**最小、已证实的 wrapper 合同修复**。取得证据本身不是布局修复或 Free 产品验收；本轮结束仍为 **DIAGNOSTIC_CODE_READY / LIVE_NOT_AUTHORIZED**，实际取证尚未执行。
