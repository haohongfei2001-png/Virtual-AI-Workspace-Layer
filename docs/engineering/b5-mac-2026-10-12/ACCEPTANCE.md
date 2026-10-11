# B5 恢复与数据保护验收

在授权隔离合成宿主范围通过。真实 IndexedDB 原失败为最后一次已提交人工标题丢失，现以检查点加经过校验、连续且未失效的人工 patch 恢复；缺日志、校验失败或before不匹配即拒绝，不猜状态。事务原子性、CAS、幂等及操作撤销继续复用B1–B4。恢复revision超过可信receipt高水位，旧receipt失效、旧证据来源全部撤销；不执行原命令。

独立JSON文件备份只包含引用/工作空间/名称/归属/偏好，去掉sources/events/coverage、云与原生授权、草稿/运行状态。checksum仅损坏校验，scope仍由已验收broker确定。跨scope/未知字段/坏版本/坏hash拒绝。只读preview返回统计及planHash；写入须原revision/CAS与同一计划，当前人工/locked资产优先，恢复可通过同一inverse进行冲突安全撤销。备份不是无条件覆盖或时间证据迁入。配额/容量由浏览器estimate读数报告；不会自动索取系统权限或静默删数据。

| 实际层级 | 最终结果 | 原始证据 |
|---|---|---|
| Node合同 | 130/130 PASS | node-confirmed.log |
| 真实Chrome IDB | 50/50 PASS | db-final.json（原39+B5 9+native边界2） |
| B5实际MV3文件/隔离/冷启动 | 3/3 PASS | real-ui-single-status |
| C1真实界面 | 10/10 PASS | regression/c1-ui |
| DOM | 49/49 PASS（明确mock） | regression/dom |
| 实际页面持久化 | 17/17 PASS | page-fixed-status.json |
| 实际MV3持久化 | 19/19 PASS | mv3-fixed-status.json |
| B4 worker/lease/CAS | 5/5 PASS | b4-core-fixed-status.json |
| 真正隐藏/冻结/恢复 | 1/1 PASS | b4-lifecycle.json |

真实worker stopped事件与前后不同boot同时保存。实际文件 actual-download.json 604引用/120主题无缩水。损坏冷启动提示仅挂自有侧栏插槽，原生header/composer/消息仍原节点，不推低输入区。当前工作树中的独立 .venv 为Python3.14.7/Playwright1.63.0；macOS27.0 26A428、Chrome154.0.8037.99、Node26.8.2。真实命令记录各报告argv及 regression/commands.json；所有浏览器全新headless临时Profile、合成loopback。源码/构建SHA与隔离记录在各真实驱动JSON，SHA256.json列证据摘要。不同运行绑定其实际源码hash，不拿单一git HEAD冒充所有运行同一源码。

原 before 失败完整保留；node-final/node-regression-fixed是旧“应该丢失人工标题”的断言，现强化成必须保留且receipt仍不重播；real-ui-final中driver helper拼名错误已修复；regression page/mv3与b4-core失败为新增双status造成定位歧义，产品保留唯一保存status，原断言不降低后通过。

容量测试在真正IDB的store.put边界注入QuotaExceededError，验证全部事务/receipt回滚；没有故意耗尽Mac磁盘或伪称OS实盘满额测试。checksum不能救援同时损坏且不可校验的checkpoint+人工日志；安全拒绝、不覆盖损坏原件，需要外部已保存文件或维护审查。生产ChatGPT、PAIA、同步/收费/部署均未运行。

下一项直接按原C3/C4补工作集、手工片段与安全定位，再C5可独立兼容回归和离线D/F任务；不等待阶段续行授权。
