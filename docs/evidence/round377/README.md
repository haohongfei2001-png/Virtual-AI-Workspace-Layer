# Round377：原生准备允许相同正文的有界基线重读

基线 2b4b33a2bff5898c6c2958b4c2981a0648b81814，原分支/PR16。外部整理 stash 保留，未清理或暂存无关副本。

正文 observation ACK 并不保证 metadata send baseline 完整：首读 partial 后，正文未变化时 adapter 的 current-object 去重阻止后续原生 prepare 重新到达已有 worker 重试路径。新增仅 live、同 generation、有效 acknowledgedBody、非 busy 的 prepare 清除成功正文去重，每秒最多一次；失败指纹、原授权期限、worker 原有每 proof 三读及共享预算保持。停止清理本代际限频；时钟非法/回退、同步退役、恢复已消费事件均不放行。已排队 intent 仍优先，不事后重放。

独立 adapter 红测和真实 observation/send owner + parser 的 L 测试证明：同正文重新组合 observation 保留 proof/bodyEpoch/native facts；partial→完整后只有新的手势可关联，早先被消费的 intent 不追认；每秒/三次重读上限保持。owner 测试使用 MockIDB、合成 metadata 及明确 offline authority，未认证实际 provider 共享 GET 预算或生成 ACK。

最终相关 93/93 PASS；第一次全量 7158/7169（11 个 scale instrumentation stop 源码锚失配）。同步两处精确锚和原断言后，最终全量 **7169/7169 PASS**、零 skip/cancel，独立审查通过。失败日志保留，不累计次数或删除旧反例。

最终源码另跑隔离 headless MV3 native-prepare wake：单次 **4 项子检查 PASS**、exit2，显式关闭双 frame 后 60 秒无附着窗口原 worker 销毁；真实点击原 editor，原 frame 内容恢复、原草稿/焦点保持、reading open0；明确四格返回后双面 open2。源码及 runner hash 无漂移。该 S 是既有休眠恢复回归，不是新增同正文 partial 重读的端到端认证；naturalWorkerSleep 仍 NOT_ESTABLISHED，生产自动进入未启用。

立即发送/已聚焦 Enter 的前置基线、完整 UI11/81/100k/G/U 仍未完成；没有访问真实 ChatGPT 或执行原生服务写入。Free NOT_RELEASE_READY。
