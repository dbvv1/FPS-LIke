# FPS 积压整合版本串行无头 smoke

- 任务：B-FPS-BACKLOG-SMOKE-20261028（本文件只记录本轮真实结果）
- run-id：`4b99b59a6b11-yP8eZD`
- 源码：commit `4b99b59a6b111c61d4aebd6e659bfb851e9eb736`，tree `c9a6488f3b243a3155358eec455935279777abb0`；开始与结束时工作树均 clean
- 浏览器：本机 Playwright 1.64.1 已安装 Chromium 156.0.8078.4（revision 1248），headless，sandbox 开启
- 运行环境：Node v22.23.2、npm 10.9.8；npm ci 记录 EBADENGINE（`package.json` 的 `engines.node` 要求 `>=24`）。本轮未在 Node 24+ 上重跑，见“限制”。
- 时间：npm ci 10:58:46Z–10:59:11Z；smoke 10:59:29Z–11:02:03Z（2 分 34 秒）；外部超时 10／20 分钟均未触发
- 命令：`FPS_SMOKE_RENDERER=native npm run smoke:backlog`（另有 `FPS_SMOKE_CHROMIUM` 指向本机已装 Chromium；路径不公开）

## 结果

| 入口 | query／参数 | 退出码 | report.passed | renderer 分类 | 实际 renderer（原串） |
|---|---|---|---|---|---|
| default | (none) | 0 | true | gpu | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| characters | ?contentSet=characters-v1 | 0 | true | gpu | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| movement | ?gameplay=movement-v2 | 0 | true | gpu | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| combined | ?gameplay=movement-v2&contentSet=characters-v1 | 0 | true | gpu | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| capture | shot=gameplay seed=1 t=1 frames=2 repeat=2 | 0 | true | gpu | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) |

四个可玩入口都实际执行了键盘／鼠标输入、暂停、继续与重开检查，report 内的 stages 为：

1. `loaded real WebGL2 scene`
2. `pointer lock, mouse aim, movement, pistol shot, reload interruption`
3. `pause freezes clock, resume and restart clear input/ammo state`

模式／资源激活断言：

- `gameplay=movement-v2`：快照 `gameplayVersion` 为 2（smoke 内断言）。
- `contentSet=characters-v1`：`contentSet.status=ready`、`active=true`，两个资源摘要见 characters 与 combined 的 report。
- 默认入口：不激活上述开关，断言 `gameplayVersion` 为 1。

capture 子段：`shot=gameplay`、seed 1、t=1、frames=2、repeat=2。两次运行逐帧 RGBA、stateHash、camera、t 比较一致；renderer 分类 `gpu`、`unmasked=true`；画面为 1280×720、pixelRatio 1。帧文件与哈希见 `capture/report.json` 和 `screenshots/capture-seed1-tick60-r1__00000.png`、`screenshots/capture-seed1-tick60-r1__00001.png`、`screenshots/capture-seed1-tick60-r2__00000.png`、`screenshots/capture-seed1-tick60-r2__00001.png`。

## 结论／交接

- 四个可玩入口与 capture 已通过本轮功能 smoke：真实 GPU（ANGLE／NVIDIA RTX 5070，分类 `gpu`）、sandbox 开启，输入、暂停、继续与重开断言实际执行。
- 建议按原门槛交 dot-B 合入网站旁置入口，并核对网站版本；不据此更换默认入口，也不把本轮 smoke 当作画质／手感验收。
- 跨任务 GPU 独占未验证，接收方按实际串行条件判断是否可接收。

## 构建 identity

- `manifest.json` 的 `build` 列出 14 个 `web-dist` 文件及每个文件的 SHA-256。
- 脚本在 capture 前后断言源 commit 不变、工作树 clean，并逐文件复核构建 hash 未变；本轮 `manifest.passed=true`。

## 串行、进程与清理

- 预检：接收端状态里只有本任务在 running；未发现其他 Playwright／Chromium／Vite preview 进程，也没有 4173／5173／4174／5174／3000／8080／8000 监听。用户自己的 Edge 进程不在本任务链内，未触碰。
- 没有可复用的共用 GPU 锁或锁根；本轮没有获取／抢占／释放任何锁。四个入口与 capture 在单条命令内串行执行。
- 本任务自有浏览器（DEBUG 日志实测 PID，括号内为父 PID）：default 111476（父 110616，父进程名未采样）、characters 59032（父进程未采样）、movement 58052（父进程未采样）、combined 47852（父进程未采样）、capture 22996（父进程未采样）；五次均以 `exitCode=0, signal=null` 退出，完整时间见 `process-evidence.json` 与 `logs/browser-excerpt.log`。这些进程已退出，父 PID 无法补采。
- 观察到的预览节点／端口：movement 的 smoke.mjs PID 75208（父进程 98908）监听 7702；该进程创建于 11:00:37.568Z，晚于 characters 浏览器退出（11:00:37.409Z）、早于 movement 浏览器启动（11:00:39.860Z），故归 movement。capture.mjs PID 89452（父进程 98908）监听 8757；default 只观察到浏览器父节点 PID 110616，其命令行和端口未采样。characters／combined 的节点 PID 与端口未采样，未推断。
- 结束复查：无 smoke／capture 脚本进程、无属于本任务的 Chromium；movement 的 7702 与 capture 的 8757 已无监听，预览随进程退出关闭。task 自有 GPU 进程全部退出；没有共用锁可归还。跨任务 GPU 独占性未知。

## 安全与脱敏

- 实际 argv 已对照本地 `DEBUG=pw:browser` 的 `<launching>` 行：含 `--headless`；不含 `--no-sandbox`、`--enable-unsafe-swiftshader`、`--use-angle=swiftshader`、`--disable-gpu`；sandbox 保持开启。
- 公开副本去掉了本机绝对路径、完整 argv 和临时用户目录；renderer 原串未改写，其他不安全字段已脱敏。原始 report 与 DEBUG 日志只留在本地被忽略的输出目录。
- 截图只包含游戏页面，没有桌面或浏览器外壳截图。

## 附加 CPU 检查

- 同一固定源上 `npm test`：197 项通过、0 失败（约 13.2 秒），纯 CPU，不启动浏览器／GPU；日志见 `logs/npm-test.log`。
- `npm run build` 由 smoke 脚本执行，内含 `tsc --noEmit` 且构建成功；构建产物 hash 见 `manifest.json`。

## 限制

- smoke 通过只是功能门槛，不代表画面或手感更好，也不据此更换默认入口。
- capture 是拍摄基础设施，`qualityAcceptance=not-performed`；本轮未做画质／灯光盲判。
- 未验证：跨任务全局 GPU 独占、default／characters／combined 的预览端口、characters／combined 的节点 PID；characters／movement／combined／capture 浏览器的父进程，以及 default 浏览器父进程 110616 的进程名（进程已退出，无法补采）。
- 未验证：Node 24+。本轮 `npm ci`／`npm test`／smoke 均运行在 Node v22.23.2、npm 10.9.8，`npm ci` 报 EBADENGINE（要求 `node >=24`）；未安装其他 Node，也未在 24+ 上重跑。
- 未合 main、未部署、未改网站版本。
