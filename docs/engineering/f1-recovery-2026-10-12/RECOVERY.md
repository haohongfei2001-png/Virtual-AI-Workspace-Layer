# 持久恢复能力

工作树 `/Users/hhf/Documents/Codex/VAIWL-Development/c1`，分支 `codex/vaiwl-f1-performance-20261012`。原 e626、原父子分支和5个原bundle全部保留。当前运行时 b7a56817056a93add0116a2b13c2b41e9aa6d28d 已在GitHub #13 精确同步；receipt `api-sync-100k-journeys.json`。

已验证完整历史：

- `recovery/f1-capacity-diagnostic-20261012.bundle`：原e626恢复基线，保留不改。
- `recovery/f1-partitions-1097564-20261012.bundle`：结构性首阶段，完整Git历史，SHA256 50ae1e863594c4712568da0a34fcc79882da8e15de3a89a1bd46954ac10a003f。
- `recovery/f1-100k-journeys-b7a5681-20261012.bundle`：完整运行时、100k9旅程及各阶段失败、全部本地分支；verify日志 `bundle-b7a5681-verify.log`。SHA256记录如下：

```text
4bf689623d325d20655d0ec0baa84a154993d6e45ddd16ed2ce2a1e5bd4b47db  /Users/hhf/Documents/Codex/VAIWL-Development/recovery/f1-100k-journeys-b7a5681-20261012.bundle
```

所有上述recovery路径相对持久开发根 `/Users/hhf/Documents/Codex/VAIWL-Development`，均非临时文件。最终文档/证据提交后另生成 `recovery/f1-final-<提交SHA前7位>-20261012.bundle`，执行 `git bundle verify` 并从该bundle克隆独立bare仓库核对全部refs/父子关系；同名 `.verification.json` 保存SHA256和实际核验。最终API同步receipt也保存该recovery目录，避免提交需要自包含自身SHA的循环。以实际存在文件和receipt为准，不将未完成推送称为交付。

恢复勿覆盖现有checkout：先确认目录无冲突，在新的专用目录使用完整bundle，核对原C34→D12→F1祖先，运行 `python3 tests/f1/verify-current-evidence.py`。未来远端同步先查实时ref；精确API工具已限制三个当前模块分支，拒绝未知远端祖先、SHA差异及force。旧运行时核验器 `verify-evidence.py` 只对应历史801595e档案。

最终fsck还发现两份未被本地branch引用的旧R0提交 d5c66221f18a24145974b9696a8788a5a8b90155（远端PR #3）及7d47d97bc7990cec7fd1d8a2a61797bf90e1c96f（远端PR #4）。未删除或重写；新增只在本地的 `refs/recovery/vaiwl-r0-pr3-20261012` 和 `refs/recovery/vaiwl-r0-pr4-20261012`，让最终 --all bundle包含这两条原历史。它们不会推送到GitHub或修改历史PR。当前全部本地refs与远端PR关系见LOCAL_REFS_CHECKPOINT.txt及REMOTE_PR_CHECKPOINT.json。
