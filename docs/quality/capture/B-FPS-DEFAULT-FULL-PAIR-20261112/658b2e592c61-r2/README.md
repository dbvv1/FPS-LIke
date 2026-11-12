# 当前默认与 `ai-courtyard-full-v1` 成对验收（658b2e5, SwiftShader, r2）

状态：**证据已取得**。完整 smoke 在两次工具脚本修复后以真实 exit 0 跑完两条入口各六自然回合；成对拍摄以固定 base_ref 单独干净 worktree 取得 12 张 1280×720 图。是否换默认仍由负责人按非作者盲选决定；本目录不表示默认已变更，也不含画面偏好判定。

## 固定源与环境

- 源：`658b2e592c612fa0801e2cc7fecdce32bb57eadb`，tree `cd025ea03ba7d9a6dfb21e0aa3e90bb5b830b66f`（本卡 base_ref，origin/main）。
- 完整 smoke：在该提交的独立 worktree 上，只叠加两个 tools-only 测试脚本修复；`src/`、资产、默认参数、依赖与锁文件未改。
- 成对拍摄：在另一个干净 worktree 上**恰好**使用该提交，无任何补丁。
- Node `v22.23.2`，npm `10.9.8`，Chromium `156.0.8078.4`（Playwright `chromium-headless-shell` 1248）。
- 原始 renderer：`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`，`rendererClass=software`。
- 启动：headless、`--use-angle=swiftshader`；保留 sandbox，实际 argv 无 `--no-sandbox`、无 `--enable-unsafe-swiftshader`。完整 argv（路径脱敏）见 `environment.json` 与各 `browser-events.log`。

## 完整 smoke

命令（两条入口串行，脚本自行 build）：

```text
DEBUG=pw:browser FPS_SMOKE_RENDERER=software node tools/smoke-backlog.mjs --full-materials
```

- 真实退出码 `0`，signal `null`；`current-default` 与 `full-materials` 均 `status=0`，各自浏览器进程 `exitCode=0`、`signal=null`。
- 固定 1365×900、DPR 1；两条入口均完成六自然回合，第三回合半场显示“交换攻守”，第 4 回合攻守互换，第 6 回合终局并显示“再打一场”，整场重置后新局推进、Escape 暂停冻结时钟。
- 页面错误 0；`browserDisconnected=true`、`previewPortClosed=true`。
- 帧耗（rAF 间隔，不是 GPU 时间或输入延迟）：默认 active mean 290.0ms / p95 550.0ms；全场材质 mean 277.5ms / p95 516.7ms。后/前均值比 **0.957**、p95 比 **0.939**，无劣化迹象。两路是自然 UI 对局，不是同一输入回放，逐回合原始样本在 `frames.json`。

## 成对拍摄

- 命令：`node --import tsx tools/capture-quality-pair.mjs --commit 658b2e592c612fa0801e2cc7fecdce32bb57eadb --query <Q> --candidate-query <Q&materials=ai-courtyard-full-v1> --out <新目录>`，真实 exit `0`。
- `Q=gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1`（前加 `?`）。
- 三机位 `gameplay`／`courtyard-gap`／`cross-lane`，前后各两次独立加载，共 **12 张 1280×720、DPR 1、FOV 80** PNG；seed 1、easy、9 Bot、idle-zero-move、60Hz、tick 120 / t 2 / frame 0、12 次 dt0 预热。
- 每张同时确认 `__shot.ready`、错误为空、boot 隐藏、WebGL2 与 art active、lighting `courtyard-light-v1`；materials 组为 `ai-courtyard-full-v1` 且 `state=ready`，非 fallback。
- 同机位同组两次 RGBA 完全一致；默认与 materials 的 state/stateHash/commands/camera/replay/renderer/viewport/actualPlayerPose 一致（像素不要求相同）。
- 逐图保留去除 `pngDataUrl` 的原 metadata 与 PNG，见 `capture/`。

## 两次脚本修复与三次尝试

| 尝试 | 结果 | 原因 |
|---|---|---|
| attempt-1 | wrapper exit 1 | 真实键盘按住 230ms 的固定等待可能整段落在一个约 250–300ms 的软件帧内，快照时还没推进 tick；`dz` 判据本身未变。 |
| attempt-2 | wrapper exit 1，内部 report `passed=true` | 六回合完整报告已写盘、Chrome 已 exit 0，但 `spawnSync` 默认 1MiB `maxBuffer` 在子进程打印 >1MiB 报告时以 SIGTERM 终止它。 |
| attempt-3 | **exit 0** | 两项 tools-only 修复后两入口六回合干净通过。 |

- 修复 1：`tools/smoke.mjs` 改为在真实按键按住期间等待模拟推进 ≥20 tick 再取快照；未删除断言、未降低位移要求。
- 修复 2：`tools/smoke-backlog.mjs` 给 smoke/capture 子进程设置 `maxBuffer: 64MiB`；未改命令、断言或门槛。
- 补丁、SHA-256、提交与真实按键/武器时序探针见 `repair/`；前两次尝试的完整独立证据见 `attempts/`，未覆盖。

## 未完成与边界

- 非作者同机位匿名盲选（两位不判更差、至少一位偏好新版）**未做**，需负责人另行安排；本目录不据此换默认。
- 硬件 GPU、升档、声音未验证；rAF 间隔不是 GPU 时间或输入延迟。
- 未合 main、未部署、未改默认、未改网站。

## 目录

- `smoke/`：manifest、build 日志、两入口 report／raw frames／脱敏浏览器事件。
- `capture/`：12 PNG、12 metadata JSON、report 与脱敏浏览器事件。
- `attempts/`：attempt-1／attempt-2 的独立证据与退出回执。
- `repair/`：两次补丁、完整 patched 脚本、哈希、提交与探针原始记录。
- `environment.json`、`SHA256SUMS.json`、`public-scan.json`。
