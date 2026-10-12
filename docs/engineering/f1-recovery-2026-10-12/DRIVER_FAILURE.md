# 首次完整旅程驱动失败原件

large-journeys-first 的临时测试 worker 新增 native-partition-cases 导入；该测试导入 replica.mjs，但临时测试 build 未复制此文件。worker 未能启动，Playwright evaluate 等待；本轮只对已核实测试 PID 68785 发 SIGINT，驱动 finally 清理临时 Profile、Chrome 和本机服务器。日志保留，结果零项不是通过。不是运行时产品缺陷，也未降低任何断言。

修复仅将被测试的 replica.mjs 复制到测试构建，并让 KeyboardInterrupt 明确记录 FAIL。第二次 new Profile 执行同一旅程。
