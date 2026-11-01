# Round385 — 最终释放 busy 后一次原绑定续期

生产content关闭分支在双ACK后最终release明确返回 `ui-release-busy` 时，使用剩余原6秒预算尝试一次 `renewDormantLease`。controller要求且先消费exact busy标记；未settle、成功release、其他失败和重复调用均不能借此续期。frame继续清空，不恢复UI grants、不发送WAKE、不走普通STATUS续租。

私有bridge只执行原producer的 HOST_DOCUMENT_RENEW→同scope HOST_REFRESH，不新HELLO、不adapter.start。前后核验原document/producer/browserDocument/route/origin、原租约仍有效、20秒expiry上限、当前dormant frame与真实上下文。scope失败标记recoveryDenied，迟到/过期回复不提交content binding。adapter.updateBinding沿用原路径，会重新观察正文，不是纯RAM期限写入。

## 证据

- 新API最初9项API缺失红保留。初版测试把now1000的新expiry设41000，违反已有20秒上限；保留8/9初次绿日志，修fixture为now2000/expiry22000，并增加22001拒绝，不放宽生产护栏。原API缺失不作为TTL反例证明。
- 最终controller14项涵盖exact busy一次机会、身份字段/超长或过期租约/迟到route/stop、原frame保持及无UI重新授权。
- content实际bridge检查仅DOCUMENT_RENEW/REFRESH，scope变化/总deadline/原lease在await期间过期均拒绝。
- 最终针对性 **102/102 L PASS**。独立审查发现的原expiry提交窗口已修正并加反例，最终复核无阻断。
- 本轮无新S；不把之前成功关闭的MV3证据提升为busy续期S或完整自动休眠。

## 仍开放

这是生产busy分支的一次续期能力，**不是持续有限hold或完整关闭竞态闭环**。定时维护与pending期间wake/fresh HELLO的处理仍需完成，自动enterDormant仍未启用。same scope不保证原grant lineage；若授权已过期，原pending仍由自身代际护栏拒绝，不能声明全部旧因果保留。原发送预算/截止点不延长。100k、即时首发和其他81/G/U继续开放，Free **NOT_RELEASE_READY**。

最终完整 Node **7249/7249 PASS**，0 skipped、exit0。
