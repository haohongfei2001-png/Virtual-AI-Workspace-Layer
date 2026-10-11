# C1 原始设计一致性增量验收

已读取原始批准设计的完整 HTML、效果图、验证记录及现行 Canonical；原件哈希匹配且未更改。修复复用现有 MV3 导航、编辑器和 B1–B4，无第二套导航。

真实界面 10/10 PASS，修复深色细节后设计反例 1/1 PASS。对比目录 final-ui 与 dark-detail-fix，桌面1440×1000、窄屏430×932。原始效果见 approved-original-light/dark，实际见 approved-implementation-*。原生合成宿主顶部、输入区仍保留，因此留白与原型首页存在明确宿主差异；数据和人工图标也不同，不声称像素完全一致或真实ChatGPT认证。

Node121/121；DOM49/49（mock sender/IDB，明确不是持久化）；真正Chrome IndexedDB39/39含迁移/撤权竞态/恢复；实际页面17/17；实际MV319/19。原始命令在 regression/commands.json，环境macOS27.0 26A428、Chrome154.0.8037.99、Node26.8.2、Python3.14.7、Playwright1.63.0。B4 core/lifecycle完成状态以对应JSON为准。

所有Chrome新临时headless Profile、合成127.0.0.1，不连接已有CDP/日常账户。已知非覆盖：真实ChatGPT/PAIA、真人图标发现性、物理IME。原失败和驱动状态污染反例保留。差异逐项详见 DIFFERENCES.md。

本里程碑完成后直接继续原计划B5；未合并、未部署。
