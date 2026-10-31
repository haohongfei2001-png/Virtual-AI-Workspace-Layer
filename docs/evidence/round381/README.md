# Round381 — 字节上限缩页后的真实按钮分页

修复 Free 导航把 200 行当作唯一翻页边界，导致长标题被 64 KiB guard 缩到 5 行后反复请求同一页。仅在成功且匹配请求的 selection 上记录 RAM 分页上限；按实际返回行数前进，正常短标题仍先 5→17 展开。范围、viewSession、区间、Project/list 变化不复用上限。延迟交互刷新携带请求代际并在应用时重新核验，旧响应不能覆盖新请求。

## 证据边界

- 独立原始红测保留：真实生产 navigation + frame client + projectFreeFrame，点击实际生成的按钮；旧代码长标题循环 offset 0。首次缩页允许一次协商，第二次必须前进。
- 最终真实按钮遍历长/短标题各 603 个独立 fixture ID；比较完整集合，验证返回前页。无手工 rowOffset 推进、无 navigationFactory 替身。
- 这仍是 **L**：DOM/runtime authority double，不是 Chrome MV3、IndexedDB 或生产 Host S 验收。
- Round380 的完整分页断言是 client 手工 offset 请求，不等于真实 UI 按钮可达。本轮补齐该漏测并修复产品缺陷。
- 不更改标题、64 KiB 上限、协议、schema 或原生权限。
- 100k 原 FAIL、即时首发、自动休眠、剩余 81 项及 G/U 继续开放，Free **NOT_RELEASE_READY**。

独立延迟请求回归：旧响应在 pointer 交互期间挂起后被新请求取代，释放交互不能应用旧页面或建立错误 cap。

最终针对性 **3/3 PASS**；最终完整 Node **7205/7205 PASS**，0 skipped，exit 0。独立代码审查未发现阻断。首次完整 7204 PASS 保留，新增测试后的最终完整结果单列，不叠加次数。
