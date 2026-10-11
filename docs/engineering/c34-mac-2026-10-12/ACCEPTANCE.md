# C2–C5 隔离合成范围工程增量

C2原位外壳/新建/原生搜索/单一阅读返回复用已验收实现，没有重画原生消息、输入、权限、模型或资源。真实ChatGPT/PAIA依赖未取得授权，生产C2/C5/C6仍待验收。

C3显式手工工作集保存引用、人工顺序与当前提示，用既有SET_PREFERENCE/CAS/同一数据库；点击惰性进入原生路由，原生修饰键/多tab文档身份、浏览器历史及输入所有权不改。阅读返回恢复来路工作集/主题段/展开/滚动，不恢复草稿或Agent状态。工作集可加入旧/unknown引用，容量1000，超限拒绝，不静默截断。

C4仅保存用户明确选中的最多2000字符片段（最多100项），包括同scope ref、唯一message/branch和body hash；未选中/跨消息/重复文本拒绝，不后台采集。扩展只搜索已知派生名/原名/别名/主题及手工片段，原生搜索和快捷键完全独立。锚点唯一且正文hash匹配才滚动真实节点；消息实际编辑后不误定位，提示原生查找。人工片段和工作集进入B5资产备份与校验恢复，既有实时人工修改优先。没有导入未知格式/原始发送授权或伪造全账户覆盖。

C5当前可独立范围：真实Chrome setZoom=2、innerWidth1440→720、devicePixelRatio1→2，真实200%截图；菜单上下键/Esc焦点、原生Cmd+K、返回不盖模型、边缘菜单及原节点/草稿保留通过。深浅色、窄屏、长列表与生命周期沿用完整真实回归。物理IME、真人图形辨识、真实host字体/权限/PAIA未验，不冒充消费级生产认证。

| 本轮最终层级 | 结果 |
|---|---|
| Node | 134/134 PASS，regression/0.log |
| DOM | 49/49 PASS（mock层诚实标记），regression/dom |
| 真正IndexedDB | 54/54 PASS，regression/db.json |
| 实际页面/MV3持久化 | 17/17、19/19 PASS，regression/page,mv3 |
| C1全部真实界面 | 10/10 PASS，final-journeys/c1 |
| B5文件/冷启动/隔离 | 3/3 PASS，final-journeys/b5 |
| C3/C4工作集/片段/隔离 | 3/3 PASS，final-journeys/c34 |
| C5真实缩放/键盘/边缘 | 2/2 PASS，final-journeys/c5 |
| B4核心/实际生命周期 | 5/5、1/1 PASS，final-journeys/b4-* |

120主题/604窗口及长聊天未缩水。环境Mac27.0 26A428、Node26.8.2、Python3.14.7、Playwright1.63.0、Chrome154.0.8037.99。每次新隔离headless Profile，owned实例CDP，无日常Chrome/私人聊天/PAIA。命令、源码与构建hash、worker原日志分别在各驱动报告，SHA256.json固定所有证据。

原before数据库缺功能失败及ui-first片段命中却提示无结果失败保留；修正使用统一knownMatches与原分页，没有减少数据/放宽断言。

本地C3/C4提交已经持久化。普通Git推送发生HTTP2与连接故障、HTTP1/IPv4有界尝试未成功；未采用逐文件API或强推，新模块远端PR尚未创建，不能假称已交付。历史PR #9/#10已经正常Git同步且保持Draft。恢复入口为连续检查点；继续独立D/F任务。
