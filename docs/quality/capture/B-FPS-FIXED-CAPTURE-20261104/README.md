# B-FPS-FIXED-CAPTURE-20261104 · 当前训练赛三机位软件基线

固定源码 `fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8`，tree `417652e69e45b06bb982cd5a0ca11265677f2fcd`。按 `docs/quality/current-capture.md` 的 `qualityCapture` 接口，对当前默认训练赛拍 gameplay、courtyard-gap、cross-lane 三机位，各两拍。

## 怎么用这批图

**用途**：这批图是固定状态（tick 120）下三个机位的软件渲染参考基线，用来回答“同机位、同状态下，改动后的新渲染是否与这批一致”。基线固定在 `fa8740d` / `417652e`；按同机位“改前｜改后｜参照”的用法，本批是“参照/基线”，“改后”目标图通常来自**改动后的提交**（源码/tree 已变），所以不能要求目标图与基线同 commit/tree。它不是硬件 GPU 基线，也不是玩家实际游玩截图或 UI 验收材料。

每机位两个文件（`-1`、`-2`）是同一次拍摄的两次独立全新 context 产物，本批中文件字节与 RGBA 哈希相同，对照时取任一即可。

| 机位 | 文件名 | 相机位姿 | 枪体 / DOM HUD | 用途（`manifest.json` 的 `cameraInfo.purpose`；gameplay 无该字段） |
|---|---|---|---|---|
| gameplay | `capture-gameplay-1.png`（或 `-2.png`） | tick 120 时实际玩家 eye `(-9.4, 1.62, -15.2)`、yaw `0`、pitch `0`、FOV 80° | 含现有枪体；PNG 不含 DOM HUD | 原玩家在 tick 120 的实际 eye/yaw/pitch（以 `cameraInfo` 的 position/yaw/pitch 为准） |
| courtyard-gap | `capture-courtyard-gap-1.png`（或 `-2.png`） | position `(2.6, 1.62, 6.4)`、yaw `-0.28`、pitch `-0.04`、FOV 80° | 无枪体、无 HUD | Maximum-gap view: near ground, divider faces, site and far wall together |
| cross-lane | `capture-cross-lane-1.png`（或 `-2.png`） | position `(-7.5, 1.62, -9.5)`、yaw `0.32`、pitch `-0.03`、FOV 80° | 无枪体、无 HUD | Oblique contrast check: outer wall, cover and long material boundaries |

**第一步怎么拍目标图**：起你自己的 preview（指向本轮构建的 `web-dist`），把下表的相对 query（或 `manifest.json.shots[].relativeUrl`）接到实际 BASE 后面打开。`manifest.json.shots[].url` 只是当轮 `http://127.0.0.1:4854` 临时 origin 的完整快照，该 preview 已关闭，照抄会 connection refused；重拍时只复用其中的 path 和 query，把 origin 换成你自己的 preview 地址，不猜端口、不复用旧服务。replay 由 `qualityCapture` 页面固定，URL 不接受 `seed`/`t` 等参数；重拍后读 `__shot.replay` 与基线逐字段核对。

| 机位 | 相对 query |
|---|---|
| gameplay | `/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=gameplay` |
| courtyard-gap | `/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=courtyard-gap` |
| cross-lane | `/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=cross-lane` |

目标图与本批对照的前提（除被测的材质/渲染改动外，下列必须逐项一致）：

- 同一 `qualityCapture` path/query（与上表逐字符一致）；
- 同一 replay/状态：`seed=1`、`easy`、9 Bot、`idle-zero-move`、60 Hz、`tick=120`、`frame=0`、`t=2`、12 次 `dt=0` 预热；并把重拍 `__shot` 的 `stateHash`、`commands`、`camera`/`actualPlayerPose` 与基线 `capture-<机位>-<拍次>.json` 的 `shot` 字段核对一致；
- 同一相机：位置/yaw/pitch/FOV 80°；gameplay 用 tick 120 实际玩家 eye/yaw/pitch；
- 同一画幅与画质：1280×720、DPR 1、`lighting=courtyard-light-v1`、`art=standards-v1`、`environment=courtyard-v1`；
- 除被测的材质/渲染代码或资源外，不夹带会改变场景、相机、光照或随机输入的改动。

**对照口径**：回归（确认渲染未被改动）看整图 RGBA SHA-256；改材质/渲染时看实际像素，按同机位、同状态做目视对照或逐像素 RGBA 差异。`stateHash` 只概括模拟状态，不含渲染、材质与 shot impact 等表现字段，所以 `stateHash` 相同不代表像素相同；若改动会改变 `stateHash`、相机、光照或场景数据，就失去了“同状态”前提，不能与本批直接对照，应先为对应状态另拍基线。

**不能拿这批图当基准的情形**：

- 本批是 SwiftShader 软件渲染；不能把其中的颜色/材质表现当作硬件 GPU 的结论，也不能与硬件 GPU 截图直接比较。
- 不能跨 tick、相机位姿、光照 id、分辨率或 DPR 比较；有一项不同就不是同一状态。
- courtyard-gap 与 cross-lane 是固定观察机位，不证明玩家可达，也不能作为 HUD/UI 或玩家视角基准；gameplay 的 PNG 也已移除 DOM HUD。
- 逐拍 JSON（`capture-<机位>-<拍次>.json`）的 `shot.match.complete=false`、`shot.match.rounds=[]`（`wins`/`losses`/`shots`/`hits` 均为 0；同时 `state.round=1`、`state.phase="live"`、`state.result=null`、`state.score={amber:0,blue:0}`），不能据此声称完成六回合或得出对局结果结论。
- 声音、手感、参照图配准与画面判优不由这批图验证。

## 结果

- 六张 PNG 均为 1280×720、DPR 1、可解码、非背景；每机位两拍按文件字节、RGBA SHA-256、`stateHash`、完整 `state`/`commands`、`camera`/`actualPlayerPose`、`replay`、`t`/`frame` 与 `rendererEvidence` 逐项一致。三张首拍已实际查看，均为场景画面，不是遮罩、空白或错误页。
- 每次拍摄使用全新 context/page，加载完整 URL，固定 replay `seed=1`、`easy`、9 Bot、`idle-zero-move`、60 Hz、120 tick、`t=2`、`frame=0`、12 次 `dt=0` 预热。首图落盘并解码通过后才拍第二次。
- 实际后端 `webgl2`；`rendererEvidence.rendererClass=software`，原始 renderer 为 `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...), SwiftShader driver)`。
- `renderInfo.art.state=ready`、`active=true`，`renderInfo.lighting.id` 与 `qualityParameters.lighting.id` 均为 `courtyard-light-v1`，`#boot` 已隐藏，`__shot.error` 为空。
- served 入口与全部加载 bundle 均与本轮 `web-dist` 文件 SHA-256 一致；预览只监听 `127.0.0.1` 的临时端口，`server.close()` 回调后 `portClosed=true`、`httpServerListeningAfterClose=false`。
- 构建 `npm run build` exit 0（Node 24.22.1）；`npm test` 430/430 通过、exit 0。未运行 `smoke`/`sim`：本卡只拍固定状态，且任务明确禁止 smoke/实时游玩。

逐图完整 URL、构建与 bundle 哈希、相机、画质参数、renderer 证据、PNG/RGBA 哈希和起止 UTC 见 `manifest.json`；逐拍完整 `__shot` 元数据（已移除 `pngDataUrl`）见 `capture-<机位>-<拍次>.json`。

## 重要缺项：清理退出基线不完整

执行 harness 在六张图与全部校验完成后，因对 `connect()` 得到的 browser 调用 `browser.close()` 只断开客户端、不终止已启动的浏览器，等待 15 秒后改为强制终止 Chromium。实际记录为：harness 自报退出意图 0，但 OS 观测 exit 1；Chromium exit code 1、signal null；预览端口随后关闭，浏览器子进程无残留。

因此本目录只可称为“六张原图与逐拍校验完整”，**不是完整退出基线**，顶层 `complete=false`、`status="capture-complete, exit-baseline-incomplete"`；只读 `passed=true` 会把它误当成整卡通过，接收方必须同时检查 `cleanExitBaseline`、`acceptance.harnessExit0`、`processRecords.harness.observedExitCode`。交付的 `harness.mjs` 已把清理顺序改为先 `BrowserServer.close()`；按本卡“不覆盖、不换根再跑”的限制，没有为修复退出码重拍或重跑。执行版与交付版 harness 的 SHA-256 都记在 `manifest.json.harness` 与 `report.json.cleanupDeviation`。

`manifest.json` 与 `report.json` 的 harness 退出字段含义：`selfReportedExitCode` 是执行版 harness 自己记录的退出意图（0），`observedExitCode` 是 OS/`run-exit.json` 观测到的实际退出码（1）；两者不同，不要只取其一。

进程证据的另外两处限制：Chromium 子进程只登记了启动时的 PID/父链/创建时间；拍摄页打开后新建的 renderer/utility PID 未逐次登记，也没有逐个采集退出码与结束时间，最终只以“无残留后代”核对；本 Playwright 版本的 `DEBUG=pw:browser` 日志在本轮只有 ws 连接/断开事件，没有显式启动/退出行，实际 argv 因此用 `Browser.getBrowserCommandLine` 核对，而不是从调试日志推断。

## 复跑方式（仅供后续单独授权）

前置条件（harness 会校验，缺一即失败并打印原因）：

- 用 Node 24 二进制直接运行；执行版记录为 `v24.22.1`，PATH 上的 `node` 可能是 v22，不能依赖。npm 通过 `NPM_CLI_JS` 指向的 `npm-cli.js` 在本进程下运行。
- 源码必须是固定版本：`HEAD=fa8740d`、tree `417652e`。harness 在构建前读取 `package-lock.json`、实测其 SHA-256，并把 `vite`、`playwright`、`pngjs`、`three`、`typescript` 五个包在 `node_modules/<包名>/package.json` 中的实际版本与锁文件 `packages["node_modules/<包名>"].version` 逐项比较；任一项缺失或版本不等即失败（本卡禁止另行安装）。其余传递依赖的版本仍需操作者自行确认。干净检查使用 `git status --porcelain --untracked-files=no`，只要求 tracked 文件干净；未跟踪文件（包括 harness 自身）不算脏。
- **可执行前置**：交付提交进入 `result_branch` 后，检出该提交时 HEAD/tree 已不是 `fa8740d`/`417652e`，harness 会在构建前失败；反过来，新 checkout 到 `fa8740d` 的干净工作树里既没有本目录的 `harness.mjs`，也没有本机那套已装依赖。复跑要先把 harness 带进那个固定 SHA 的工作树：准备一个 checkout 到 `fa8740d`/`417652e` 且 `node_modules` 能通过上述依赖校验的工作树，把本目录的 `harness.mjs` 复制到该工作树的一个未跟踪路径（例如 `outputs/harness.mjs`；`--untracked-files=no` 不会把它算脏），再从该工作树根运行下面的示例。
- 输出根由 `FPS_CAPTURE_OUT_ROOT` 指定（绝对路径或相对仓库根）；默认 `outputs/B-FPS-FIXED-CAPTURE-20261104/fa8740d-swiftshader`。harness 会递归创建该根；若根内除 `preflight.json` 外已有任何文件则直接拒绝，不会覆盖；空根会由 harness 写入 `preflight.json` 作为独占标记。
- 还需要 `FPS_CAPTURE_CHROMIUM`（已装 Chrome for Testing 二进制）和 `NPM_CLI_JS`。
- `PACKAGE_LOCK_SHA256`（可选）是期望值而非记录值：设置后 harness 会把实测的 `package-lock.json` SHA-256 与之比较，不一致即失败；不设置也会实测并写入 `manifest.json.environment.packageLockSha256`。`environment.dependencies` 同样来自实测的 `node_modules` 版本。
- 调试日志：Playwright 只读 `DEBUG`；`PW_DEBUG_LOG` 不是 Playwright 变量。本 harness 会把自身 stderr（含 `DEBUG=pw:browser` 的浏览器事件）同时 tee 到 `PW_DEBUG_LOG`，所以设置 `DEBUG=pw:browser` 与 `PW_DEBUG_LOG` 即可，不需要 `2>` 重定向。tee 只在输出根被成功认领后写入，放在独占输出根内不会触发独占拒绝；如果你仍自行用 `2>` 重定向，请把日志放到输出根之外，否则 shell 会在 harness 启动前于根内创建文件，被 `prepareOutputRoot` 拒绝。

本次修正未在新根完整重跑六拍（本卡禁止换根重跑，且本机 PATH 只有 Node 22）。已实际验证的是：`node --check`、`computeOutcome` 的三种 status 结果、`verifyDependencies` 在真实固定版本工作树上的通过路径及版本不符/锁哈希不符/缺失包的失败路径、空根创建与 `preflight.json`、已有产物时的独占拒绝、非 Node 24 时不创建/不改动输出根且不写 `harness-fatal.json`、preflight 通过后的致命错误会写 `harness-fatal.json`、以及 `PW_DEBUG_LOG` 的 stderr tee。完整复跑仍需 owner 单独授权并在 Node 24 环境执行。

已提交的 `manifest.json`/`report.json` 来自执行版 harness，其环境字段是记录值而非校验值。交付版已加入上述依赖实测校验；本次用真实 `package-lock.json` 与已装 `node_modules` 验证通过，但没有重跑六拍，因此没有改写已提交报告里的环境字段。

示例（尖括号为占位，不是本机路径；harness 已复制到固定 SHA 工作树的 `outputs/harness.mjs`）：

```sh
export FPS_CAPTURE_OUT_ROOT=outputs/B-FPS-FIXED-CAPTURE-20261104/<new-run>
export FPS_CAPTURE_CHROMIUM=<chrome-for-testing>/chrome.exe
export NPM_CLI_JS=<path-to-npm-cli.js>
export DEBUG=pw:browser
export PW_DEBUG_LOG=$FPS_CAPTURE_OUT_ROOT/pw-debug.log
<node24>/node.exe outputs/harness.mjs
```

harness 会执行一次构建、起一个同进程 Vite preview、启动唯一一个 headless Chromium，并串行完成六拍；不要在已有输出根上重跑，也不要改成本机可见窗口。致命错误会先打印到 stderr；只有 `prepareOutputRoot()` 成功后才会写 `harness-fatal.json`，Node 版本或独占校验失败时不改动输出根。

## 未验收

硬件 GPU、完整六回合对局、声音与手感、参照图配准、画面判优均未验证。两个观察机位不证明玩家可到达，也不含枪体/HUD；`gameplay` 的 PNG 不含 DOM HUD。逐拍 JSON 的 `shot.match.complete=false`、`shot.match.rounds=[]`（`state.round=1`、`state.phase="live"`、`state.result=null`），不能据此声称完成六回合。

## 脱敏

公开副本保留原始 renderer/vendor/version、Chromium 版本、规定启动参数与相对文件名/哈希；去掉了机器用户名、绝对路径、完整 argv、CDP/调试端点和原始调试日志。本机完整进程记录、构建日志、调试日志与执行版报告只留在仓库工作区内被 `.gitignore` 忽略的 `outputs/` 独占根（未提交），不在仓库外。若用 `FPS_CAPTURE_OUT_ROOT` 把输出根放到其他位置，harness 生成的 `manifest.json`/`report.json` 会按该根与仓库的实际关系（是否在 worktree 内、是否被 `git check-ignore` 忽略）改写位置说明，不会继续声称它在 `outputs/` 内。
