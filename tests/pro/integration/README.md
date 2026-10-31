# 共享 owner 最小接线候选（默认关闭，尚未集成）

`shared-owner.patch` 只针对已有 `src/runtime/host-binding-service.mjs` 提议 19 行新增、6 行替换。正式源码没有应用此补丁；Free 不新增 Pro import、权限、数据库或 source profile。正式集成负责人应审查并在其开发线上接入。当前候选和测试不构成真实宿主、自然模型或用户验收。

## Factory 接口

共享服务新增可选 `proServiceFactory = null`。只有 packaged composition 提供函数时才实例化；消息、页面配置及序列化描述都不能启用它。函数同步接收现有对象，返回具有六个自有可调用方法的普通对象：`handle`、`revokeDocument`、`revokeMount`、`revokeTab`、`stop`、`isIdle`。返回 Promise、缺失方法、属性 getter 或没有现有 UI owner 均拒绝。

注入对象包含 `ui`、`assetUi`、`repository`、`workspaceRepository`、`freeEvidenceRepository`、`nativeRepository`、`readService`、`views`、`browserLocal`、`now`、`elapsedNow`、`schedule`、`cancel`。这些是已有 owner 的相同实例，没有新增独立 source reader。没有向 factory 额外暴露 provider 或 authority。`assetUi` 保留当前 Browser-Local 个人空间限制；持久资产仍须由共享 owner 验证相应作用域，不能以 factory 注入本身授权。

最小接线示意，两个 owner 函数仍须正式负责人实现并审查：

```js
proServiceFactory: existing => createProWorkerService({
  ui: existing.ui,
  invoke: ownerInvoke,
  projectReply: ownerProjectReply,
  elapsedNow: existing.elapsedNow,
  schedule: existing.schedule,
  cancel: existing.cancel,
})
```

补丁先匹配精确 `HOST_UI_PRO`，再进入原有通用 `HOST_UI_` 路由。UI 文档/挂载撤销、显式 document/tab invalidation、tab close、stop 均接入撤销链。Pro 撤销先调用；接口异常不阻断 Free 原有清理。Pro 的 `isIdle()` 必须同步明确返回 `true` 才允许原 owner 认定安静；异常或 Promise 均保守返回非 idle。方法绑定后不能被 factory 返回对象的后续替换改变。

## Worker RPC 接口

实现文件为 `src/pro/integration/worker-service.mjs`。它只负责 RPC 生命周期与边界，不负责生成 SemanticGrant、人工 intent、执行 ticket、source receipt 或真实 NONE 权限。

请求精确形状：

```js
{ v: 1, type: 'HOST_UI_PRO', grantId, mountId, action, payload }
```

`action` 只允许 `sharedSnapshot`、`evidence`、`commit`、`view`、`navigation`、`background` 六个 port 名；`payload` 必须是普通 JSON object。请求整体和最终响应分别不超过 65,536 UTF-8 字节，深度最多 16、节点最多 8,192。额外 envelope 字段、getter、隐藏属性、稀疏数组、循环、自定义原型、非有限数字、函数、BigInt、symbol 等一律拒绝。协议检查不把 payload 内任何描述当作授权；owner 仍须按 action 严格验证实际命令形状、功能许可、能力、处理同意及目标版本。

| Worker 注入接口 | 责任 |
| --- | --- |
| `invoke({action,payload,context,guard,signal})` | 仅在 `ui.withScope` 内调用；根据当前 owner RAM 权限取得六 port 能力，执行授权操作；返回 `Result<privateValue>`。不得脱离 guard/signal 继续工作。 |
| `projectReply({action,value,context})` | 必需、同步、按 action 严格验证并投影 public DTO；输入是 worker 内私有结果，输出不能包含授权、原始 evidence pack、完整索引或私有错误。 |
| `handle(message,sender)` | 只有成功且始终满足文档/作用域 guard、6 秒时限、最终 UI revalidation 的投影结果才能返回。 |
| `revokeDocument` / `revokeMount` / `revokeTab` | 同步先 abort 匹配请求。尚未取得父文档的授权请求在 document 撤销时保守 abort。 |
| `stop()` / `isIdle()` | stop 立即禁止新请求；响应已超时仍计入未 settled 的 scope/invoke Promise；stop 后永远不宣称 idle。 |

`projectReply` 没有默认实现；缺失时构造失败。generic JSON 检查和常见私有字段拒绝仅是第二道边界，不能替代 owner 对六种 public DTO 的严格 codec。`evidence` 返回可审查的处理描述；metadataEvidence、选择文本及 handle map 留在 worker。失败统一返回固定公开 reason，不透出任意异常 message 或失败 value。scopeKey、authorizationEpoch 等版本数据允许输出；`context` 仅允许冻结行展示枚举 `primary-topic` / `related-topic` / `uncollected` / `pending`，owner context 对象不得输出。

现有 `createProController` 的同文档 fixture owner 是合成开发环境。它没有冒充以上生产 RPC；真实 UI 的 worker facade、六 port 的生产来源以及 public DTO codec 仍由共享 owner 接入。与 `same-db-store.mjs`、`billing-store.mjs` 联动时，还需完成共享 backup/codec/minimum-reader/GC 接线；本补丁不直接打开连接、升级 schema 或持久化授权。

## 可执行验证

```sh
node tests/pro/worker-service.test.mjs
git apply --check tests/pro/integration/shared-owner.patch
node tests/pro/integration/verify-shared-owner.mjs
```

最后一个命令自动复制 `src`/`tests` 到临时镜像，只在镜像中应用补丁，执行 syntax 检查、既有 host binding/UI owner 回归和新增 factory/RPC 贯通测试。运行结束验证正式文件 SHA256 未变化并删除镜像。输出零 tests 会判为失败。当前受控执行环境需允许 Node 子进程运行；它不访问真实宿主、模型或用户数据。

本轮结果：worker 28/28；镜像 202/202（既有 host binding 45、binding idle 10、UI owner 64、UI isolation 73、新增 factory/worker 10），全部无跳过。详见 `shared-owner-report.json`。报告中的候选 SHA256 属于临时补丁结果，不是正式共享源码已集成的声明。
