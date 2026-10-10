# B1 执行尝试与级别说明

实验在本次授权的独立 Mac 临时目录执行，仓库提交的代码/测试与最后一次运行版本一致。

- **Runner初次尝试**：Playwright \`route.request().url\` 当作字段，导致\`TypeError: ... url.startsWith is not a function\`。修复为\`url()\`。该次无完整场景结果，不能计PASS。
- **首次真实Chrome完整执行**：5 PASS / 5 FAIL。仓库层拒绝了broker已标准化的scope（丢失verified标记），导致写、读、跨账户与恢复相关场景失败；路由/原生节点类通过。此为实际实现错误，不得归咎于测试环境。
- **第二次完整执行**：修复scope二次传递，10/10 Node、10/10 Chrome synthetic fixture PASS。
- **第三次完整执行（最终版）**：增加两标签真正并发创建CAS反例，10/10 Node、**11/11 Chrome** PASS。独立Chrome profile，所有账号与页面合成。结果JSON与Node测试日志已保存。

原R0 Chrome矩阵的19 PASS / 4 FAIL / 1 BLOCKED没有被重新计算或篡改；这些失败中的SPA/disable/freeze/真实宿主阻塞仍以PR #4原证据为准。

没有本轮真实ChatGPT测试、物理IME、PAIA本体、真实账户历史的任何通过声明。
