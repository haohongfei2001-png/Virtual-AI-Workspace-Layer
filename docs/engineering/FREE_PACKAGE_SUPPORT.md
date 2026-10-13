# Free 离线合成包支持范围

当前包为 **SYNTHETIC_ONLY / NOT_RELEASE_READY**。它只匹配 `http://127.0.0.1/hf/*`，不能用于真实 ChatGPT，不代表 FREE_ACCEPTED、商店审核通过或已经发布。真实账户、跨设备活动、PAIA 共存及真人输入法验收仍需各自条件。

在正式仓库目录执行以下命令，目标必须是尚不存在的新目录：

```sh
node simulator/package.mjs /private/tmp/vaiwl-free-package-candidate
```

输出包含 `extension/`、`vaiwl-free-synthetic-only.zip` 和 `SHA256SUMS`。ZIP 根目录包含 `manifest.json`，解压后可加载该目录；也可直接加载 `extension/`。ZIP 使用固定时间、固定权限、排序文件名和原样存储，相同源码产生相同字节，不写当前时间或本机绝对路径。

包内 `verification/source-manifest.json` 记录构建输入 SHA-256；`build-manifest.json` 记录除自身外全部包文件 SHA-256；`package-info.json` 明确支持边界。`SHA256SUMS` 校验 ZIP。校验和用于内容核对，不是签名或发布认证。解压目录可执行 `node simulator/package.mjs --verify /路径/extension`，检查文件哈希、合成权限边界及 worker 静态依赖完整性。

## 安装与离线运行

使用独立 Chrome 测试配置，在扩展管理页开启开发者模式并加载已解压的扩展。此步骤由用户主动执行；打包脚本不会启动浏览器或修改现有配置。

合成宿主完整源码不在 ZIP 内，需保留与 source manifest 匹配的本仓库。在仓库运行 `node simulator/server.mjs`，然后打开 [本地合成工作区](http://127.0.0.1:48173/hf/A/c/T0?mode=mv3)。无需私人账户、远端模型、付费服务或部署。Manifest 声明 Chrome 120 最低版本；该声明不表示全部历史版本已经完成兼容测试，实际浏览器版本以对应测试报告为准。

## 升级、回退与恢复

先使用设置中的备份功能导出人工资产，并保留旧 ZIP 与 SHA-256。升级前关闭合成宿主页；保持已加载目录路径不变，替换为经校验的新包后在扩展管理页重新加载。不要自动刷新含草稿的页面。

回退须同时核对数据库 schema 支持范围。旧 reader 遇到不兼容 schema 应拒绝访问，不能清库或强制降级。不要通过卸载扩展回退：卸载可能删除扩展存储。必要时在另一测试配置加载旧包，只恢复经预览允许的人工备份，不恢复活动证据或来源授权。

## 隐私与限制

包仅有 `webNavigation` 权限和 loopback 内容脚本匹配；真实宿主权限、网络模型及生产来源认证均未加入。工作集与选定片段属于本地人工数据。备份不携带有效发送证据、来源授权或原生草稿；无法安全修复时保留原记录；可修复时先核验检查点和分片，并撤销旧来源有效性。性能、恢复、scope 隔离等合成结果不能代替真实产品验收。

2026-10-13新增本地实测：同一路径Round23→Round24→Round23实际包重载/回退保留extension ID、人工资产、原生/活动事实与宿主草稿；两包均manifest0.2.0/schema3，不代表跨schema升级已认证。独立模拟schema4数据库使旧schema3 reader拒绝且数据保留。证据见`free-round24-upgrade-2026-10-13.json`，仅隔离合成Chrome环境。

当前Free合成服务首次读取旧原生分片时会同库迁移为 `vaiwl-native-version-index-v1`，数据库schema仍为3，但原生记录格式已改变。旧格式的原生片与上一检查点按引用保留，Pro人工资产不变；格式迁移不恢复任何来源授权。旧包是否兼容必须检查其原生格式支持，不能仅比较schema版本。没有索引支持的旧包应拒绝读写；需要保留原库并使用支持索引的版本恢复，不能清库强制回退。Round24的同格式回退证据不覆盖这次索引格式迁移；实际跨包索引升级/旧包拒绝仍需另行验证。
