# B5 实施检查点

依赖现有 Draft PR #9（C1一致性 head a055246），分支 codex/vaiwl-b5-protection-20261012。

原失败 before.json：真实IndexedDB中最后提交的人工标题在损坏恢复后丢失；7条B5基线中其余是缺失能力，单独区分。实现基于现有 v2 数据库、checkpoint+已校验人工patch、同一CAS/事务/操作receipt，无重建B1–B4。

after-core/after-transport：真实IDB 46条通过（原39+新增B5 7）。导出人工资产与引用，去除全部发送/来源/coverage和执行授权；只读预览、CAS hash计划、当前human/lock优先、不覆盖最新意图。旧证据恢复后全部撤销、旧receipt不可重播。现有损坏恢复断言由允许丢失最新人工标题强化为必须保留。

备份/恢复/容量低频UI已接入原编辑器，仍需真实MV3文件下载/上传/预览/冲突/撤销与损坏冷启动UI验证、原生quota故障注入、完整回归。B5尚未裁决完成。下一：补这些实际旅程并修复失败，随后C2–C5与D/F授权范围。
