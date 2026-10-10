# VAIWL v2 原型验证：实际范围与限制

日期：2026-10-10。证据等级：PROTOTYPE_SIMULATION。37/37案例通过，0失败；不是正式扩展、实际ChatGPT账户或产品验收。旧v1的20/20保持历史范围，不累加为57项产品测试。

## 精确来源

- 原型：`prototype-v2.html`，48,733字节，SHA256 `b26a4631c879e74789ae3c61d0decf07837cf04afee3cbfa58ab69c34f523ba1`，Git blob `c557cd8dbe687f637f8b20d9967ce508c8bfd0a1`。
- 实际测试脚本：[validation/test_v2.py](validation/test_v2.py)，SHA256 `6d66c1e4acafc84d41537004c5e3fcbfe732ab9a2f3e67790d2e9e38fdbf36f1`。
- 实际原始结果：[validation/test-results.json](validation/test-results.json)，SHA256 `31de51e4eedbb4098cc38fe40ee7ef19a27a92f5ac85ea31a872b7814a1687d7`。
- 浏览器：Chromium 144.0.7559.96，headless，Python Playwright。通过page.set_content在内存加载，不是file://导航或实际扩展安装。
- 默认1440×1000；窄屏390×844；720×500仅为缩放后可用CSS空间近似，不是物理200%缩放或真实IME证书。
- 各测试记录页面pageerror及request事件：本轮均为空。只支持这些页面/测试期间的观察，不宣称整个浏览器进程绝对零网络。

个人模拟库88主题、339对话；最近月段30活跃、55区间外、3未知主题。PAIA60条中29命中、27区间外、4未知，跨三个原生来源；另有未归类对话和独立团队示例。固定“示例今天”2026-10-10、时区America/Chicago可在界面改；没有真实午夜调度。complete与verified_fixture是合成标签，不是实际时间源认证。

## 案例与范围

| 类别 | 实际通过案例 |
|---|---|
| 初始复杂样本 | initial |
| 日历边界 | date_example、month_end、leap、years、continuity（四日期×三长度×30段相邻边界） |
| 当地日期与DST | timezones（芝加哥/上海跨日、DST重复小时） |
| 时间证据语义 | historical_existence、rejected_signals、unknown、active_partial |
| 范围及归属不变 | range_ui、sources、clock_ui、allhistory |
| 卡片与历史访问 | history_ui、many_inside（PAIA60条到末尾）、fold |
| 固定与当前例外 | pins、chatpin、preserve_host、workset |
| 模拟原生/故障退出 | disable_board、failure |
| 既有设计流程 | rename、correction、search、accounts、imports、write_gate、write_conflict |
| 键盘与呈现 | menus、dark、narrow、screenshots、reduced_motion、browser_zoom_equivalent |

preserve_host验证相同对话在时间/模式切换时，textarea和transcript是同一JS节点，输入文字和selection范围保留。failure对模拟故障按钮做同样节点检查。并没有运行React宿主或Chrome扩展disable/reload链，也没有证明原生焦点/物理IME全状态。

测试中部分入口通过直接调用detail/settings函数设置场景，随后使用真实Playwright控件点击；不是每项都是从首页零辅助的完整E2E。menus只测试范围菜单的方向键/Home/End/Enter/Esc及焦点返回，不代表全部菜单与屏幕阅读器验收。

## 失败和修正记录

第一轮在18项通过后被外部执行时限终止，出现EPIPE；没有完整终态，不算全套通过。日期格式器与转换缓存用于消除反复格式化开销，未改变日期规则。另一次定向定位暴露通用测试选择器命中隐藏工作集控件，改为可见目标。

后续完整运行36/37通过，workset失败：通用restore选择器点击了活动modal背后的可见按钮，受到modal拦截。测试辅助改为优先活动modal中的可见控件；未删除原断言、减少样本或放宽超时。最终相同原型的37项全部通过。

失败原始JSON SHA256：`f7e1a006ed266df1433e61459903eb6d5b1600f0860f85c44a224c3c3a8d46ce`。完整失败/中断日志和截图保留在本轮对话交付ZIP的validation目录，未把旧失败改成PASS。仓库本页登记失败，成功JSON为最后一次实际结果。

## 原型仍未证明的能力

1. 当前ChatGPT登录态的精确字体、间距、菜单时序、主题/强调色和所有视觉变体；本轮仅中性浅深色近似。
2. 真实用户发送时间、可靠账户/组织绑定、时间覆盖区间、快照新鲜度、导出结构或未知历史全量发现。
3. 实际原生节点/路由、Chrome扩展安装/禁用/重载、真实tab恢复、PAIA共存、物理IME、屏幕阅读器及真实200%缩放。
4. 数据持久化、CAS/并发撤销、云模型/同步、真实原生改名。原型无localStorage/后台/付费调用，状态仅在内存。

设计差异：原型complete是简化全事件覆盖flag，正式TimeCoverage须按scope/branch/窗口与completeThrough建证据；原型归属/undo仍是内存与快照，正式需事务和人工冲突；模拟原生标题是native字典，不能当真实执行器。主题固定/4行预览/12条展开/列数为可评审解法，未自动视为用户逐项批准。

## 复验与截图

在已经具备Python Playwright和`/usr/bin/chromium`的隔离环境运行：

```sh
python docs/prototypes/v2/validation/test_v2.py
```

脚本会重写本地test-results.json并输出截图；复验前保留原记录。不要用ONLY局部测试结果冒充37项全套。它不安装扩展、不连接ChatGPT。其他系统需明确调整浏览器路径并记录环境，不暗示命令无需依赖即可执行。

六张最终原图在本轮交付ZIP：topics-desktop、paia-expanded、history-chat、native-restored、chat-dark、chat-narrow。仓库未上传这些PNG，不能使用不存在的仓库图片链接。图像检查证明示例呈现，不证明真实宿主像素一致。
