# B2/B3 — 运行与验收

基于PR #6，继续使用同一个B1数据库。完整结论见 `docs/engineering/B23_ACCEPTANCE_2026_10_11.md`：Node 118/118、Chromium DOM 49/49；真实IndexedDB/正常URL/MV3 BLOCKED。没有生产ChatGPT数据渠道。

## 启动

```sh
node simulator/server.mjs
# 浏览器打开 http://127.0.0.1:48173/control.html
node simulator/build.mjs /tmp/vaiwl-b23-extension-new
```

Node22+。管理入口支持创建、改名、图标、派生标题、归属、排序、撤销。MV3只用于获准隔离Profile的合成宿主，不安装到日常浏览器。

## 云端回归

```sh
node --test tests/b1/broker.test.mjs tests/hf/*.test.mjs tests/b23/*.test.mjs
python tests/b23/view-browser.py --browser /usr/bin/chromium --out /tmp/vaiwl-b23-dom-new
```

`view-browser.py`导入原`browser.py`的全部48项，再增加P11视图损坏场景；原套件仍可单独运行。输出目录必须新建。Python Playwright1.57.0，实际Chromium144.0.7559.96；不使用--only作为最终验收。

Node仓库/迁移/故障测试使用明确的mock-IDB。DOM驱动在真实Chromium执行，但opaque页面中fake router、fake sender、mock-IDB不证明磁盘、真实浏览器历史或worker持久化。

## 补验原生环境（本轮已尝试，BLOCKED）

```sh
python tests/b23/real-browser.py --mode db --browser /path/to/approved/chromium --out /tmp/b23-native-db.json
python tests/b23/real-browser.py --mode page --browser /path/to/approved/chromium --out /tmp/b23-native-page.json
python tests/b23/real-browser.py --mode mv3 --browser /path/to/approved/chromium --out /tmp/b23-native-mv3.json
```

驱动使用新的临时Profile及loopback服务器，不访问ChatGPT。db运行29仓库合同及2迁移检查；page验证真实刷新、新tab、账户隔离、两连接CAS；mv3检查真实worker停止事件、boot变化和持久记录。worker恢复触发为显式刷新合成页，不等于自动重连。策略拒绝exit2，断言失败exit1，无fallback或绕过策略。

## 原始证据

先前文档引用的 `docs/engineering/b23-results/RAW_RESULTS.tar.gz` 未随旧提交交付，该引用已撤回。现在真实归档位于 `docs/engineering/b23-final-2026-10-11/raw-parts/`，是完整原始字节的gzip/base64分片，不是摘要。

```sh
python docs/engineering/b23-final-2026-10-11/decode-evidence.py --out /tmp/b23-evidence-new
```

自动核验并恢复完整Node TAP、49项DOM JSON、两项失败反例前后记录、测试helper错误、三份原生阻塞原件及命令/退出码。SOURCE_AND_RUNS.json绑定代码与bundle。已有checkpoint和旧audit保留，不累加测试数量。

## 恢复边界

v1→v2不可假定向后兼容。恢复需damagedHash与有效checkpoint/journal，可能损失最新修改；恢复撤销来源并使旧receipt失效。视图偏好损坏只隔离/提示，不删或覆盖记录。不得用seed重播或删库假装恢复，不得将合成provider当真实认证。
