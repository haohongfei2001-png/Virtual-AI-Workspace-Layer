# 原始研究正文与验证档案

这是对 Draft PR #1 初始 17 份提案文档的证据补充，不是第二套产品方案。唯一队列仍为 [STATUS](../../STATUS.md)，批准边界仍为 [AUTHORITY](../../AUTHORITY.md)，下一任务仍为 [R0_CAPABILITY_SPIKE](../../experiments/R0_CAPABILITY_SPIKE.md)。不引入 VAIWL-00 或其他平行任务编号。

## 原件与读取范围

已读取独立 research.html（83,201 字节）、prototype.html（57,018 字节）和完整 ZIP（812,522 字节）。ZIP CRC 通过，13 个成员全部读取/检查：9 个文本或源码文件、4 张 PNG。两个独立 HTML 与包内同名文件逐字节相同。

报告 HTML 正文与 Markdown 渲染后的去空白文本相同（26,432 个字符）。这只是原件对应性核验，没有重新生成报告或原型。完整包 SHA256 为 `401f3788e017daf24a4cda64f74e23a6154678ee346e413e2916bf7310a2e100`；全部文件大小、SHA256、Git blob 与存档路径见 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)。

## 本目录内容

[research.md](research.md) 是全部 §0–20 和参考资料的原始正文，而不是回复摘要或重新转写版。[sources.json](sources.json)、[original-README.md](original-README.md)、[VALIDATION](validation/VALIDATION.md)、[test-results.json](validation/test-results.json)、[last-run.log](validation/last-run.log) 同样原样保存。这六份文档均按原始字节和哈希核验。

本目录另含本说明及清单，共八份文件。现有专题规格仍是待评审整理版；本目录原稿仅作历史证据，不提高其批准效力。初始 SOURCE_REGISTER 中“仅提交 Markdown”的说明对应 17 文档初始提交；本次补充增加纯文本 JSON、日志证据，不增加任何产品运行代码。

HTML、Python 测试源码、四张 PNG 和 ZIP 本体均已读取，但仍保留为原对话附件/包内原件，没有上传为仓库 runtime，也没有部署到 GitHub Pages。后续需要原型字节时按清单取原件；不能凭文字重建后声称是原版。

## 测试和证据边界

20 PASS / 0 FAIL 是上一轮 Chromium 144.0.7559.96、page.set_content 内存页面记录，本次没有重跑。实际页面请求和错误监听为空不证明浏览器全进程无网络。file://、LocalStorage 跨刷新、真实账户、原生 Project/改名、扩展生命周期及 PAIA 共存均未由它验证。

原 VALIDATION 的“三个 PNG”指三个原型截图；ZIP 另有一张报告截图，共四张。本次读取四张，不修改历史文案。详细模拟限制与未来任务映射继续使用 [PROTOTYPE_EVIDENCE](../PROTOTYPE_EVIDENCE.md)。

旧 GitHub 和网页来源为原研究时点记录，不是本次重新核查的当前能力或平台许可。本次补档不开放任何真实资料、模型、原生写入或安装权限。
