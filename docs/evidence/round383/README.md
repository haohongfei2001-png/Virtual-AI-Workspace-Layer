# Round383 — 已聚焦编辑器的输入准备链

修复已聚焦原生编辑器继续输入/粘贴不会触发正文准备的问题：原 passive observer 新增可信、非composition、原编辑器内 `input` 作为准备信号，复用 onNativePrepare 与现有有界 prepareNativeBody。input 不创建 send intent、不读取 data/value/textContent、不修改原节点/事件；Send暂时disabled时仍可准备，非编辑器按钮不触发。原一秒间隔/三次读取/共享预算不变。

## 验证

独立新 L 13 项原源码 **10 PASS / 3 FAIL** 保留。修复后与原 intent、owner baseline、content prepare wake 合计 **43/43 PASS**。包含重复编辑不消耗 intent ID、草稿/事件data读取哨兵、rich span/Send disabled、嵌套widget/island、IME、synthetic、disabled/readonly/hidden、stop保留回调；原owner反例继续保证早于baseline的intent不会事后补权。

实际隔离 headless Chrome MV3：

`FREE_BASELINE_PREPARE_MODE=input node tests/host/prepared-baseline-package-mv3.mjs /private/tmp/round383-input-mv3.json`

**2项 S 子检查 PASS，exit0**。已有编辑器保持聚焦，authenticated partial1/full0 后仅执行一次 Input.insertText，passive计数严格 input1/pointerdown0/focusin0，发送动作0；同文档/正文/原消息节点/frame下 full+1、detail+1。随后原生发送形成与fixture确切message ID一致的observed-self-send锚，无sentAt、无raw event。source/fixture/runner/build manifest稳定，浏览器与网络guard清理正常；worker无debugger附着，生产未插桩、未修改timer。独立代码审查通过。

## 边界

此为 LEGACY_J2 离线部分基线恢复 S，不是完整J2/休眠恢复/物理IME认证。最终ACK仍可能来自既有 firstSend，不能独自归因 sendCandidates。输入后立即Enter而baseline仍pending不获追认；预填草稿冷启动第一下直接Enter、真实生产首发profile能力与G条件尚未闭合。本轮增加自然编辑带来的前置准备机会，不延迟或接管用户发送。

100k原FAIL、自动休眠、即时首发、其余81/G/U继续开放；Free **NOT_RELEASE_READY**。

最终针对性 **56/56 PASS**；最终完整 Node **7218/7218 PASS**，0 skipped、exit0。首次全套7217/7218的唯一失败为旧retirement测试硬编码6个监听器；改为精确7种事件集合（新增input），保留原退休/旧回调/替换隔离断言，经独立复核。原FAIL日志保留。
