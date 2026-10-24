# Round369：延迟历史证据在真实 MV3 恢复后落库

从 7c42d3a 继续，产品源码未修改。沿用隔离 headless Chrome、独立 Profile、loopback 认证 fixture 与 worker 外网阻断。新 dormant-history-wake-mv3 runner 使用 J3 当前消息，原始时间在 fixture 构造时固定为45天前；测试进程只延迟公开 original_send 字段，同一消息/作者/谱系/正文/路由不变。HTTP/page 不提供发布控制，未向仓库写预置事件。

最终一次连续运行 **4项命名子检查PASS**：实际双frame ACK关闭；无调试附着60秒窗口观察原worker销毁；首次可信四格返回恢复新worker、原frame/草稿及项目内容；关闭前真实IndexedDB evidence revision0/events空，窗口结束后服务端公开既有原始证据，首次返回后唯一codec2 strict history event落库。事件messageId/原sentAt/second/new-send/committed/本人验证与offline-original-send-v1一致，hints为空，nativeActions为空。完整事件和source在报告中，原生send/create未执行。

只读oracle在原扩展frame打开既有仓库，read后关闭连接并detach；观察窗口不读frame/worker，不附着worker。加载包仅原isolated session入口测试补丁，未替换授权/计时器/产品逻辑；源码、manifest、runner运行中未变。证据为 **S_INSTRUMENTED_MV3_DORMANT_HISTORY_WAKE / LEGACY_OFFLINE**。退出码2与naturalWorkerSleep NOT_ESTABLISHED保留，不能从Target销毁推断完整自然休眠原因。临时包不是未插桩生产候选。

失败原件与精确runner均保留：
1. 首跑假设“无普通返回就无历史校准”，但启动时已存在事件，前置断言FAIL。合法foreground校准是可能路径，报告未记录确切触发源；不清库制造empty。改为同一原始证据延迟可用。
2. 延迟fixture首次关闭返回false，未通过产品关闭守卫。未强制release/重试同次关闭；下一run先连续300ms采样真实prepareIdle成立，再单次关闭，产品期限不变。

第二次普通返回后立即读取的events/hints快照不变，只记该快照，不宣称第二次校准已完成。没有移除workspaceEntered的实际浏览器变异运行，所以本轮证明恢复后的历史校准闭环，不证明该通知是唯一触发源；独立通知反例见Round368。48/48相关Node PASS；历史worker替换测试标签现明确L/MockIDB，非真实D/S。

完整UI-11、生产自动休眠、休眠后首发、live原始时间profile及81/G/U继续未完成，Free NOT_RELEASE_READY。下一项继续实际首发/旧ACK恢复边界与未完成离线生命周期，不将本轮严格历史event当作本地gesture ACK或无时间观察锚。

运行后仅修正runner注释与前置断言文案，撤回唯一触发源措辞；执行逻辑未变。报告对应的逐字节runner保存在final-runner.mjs.gz，不冒称其hash是文案修订后的文件。
