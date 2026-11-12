# 当前默认与 `ai-courtyard-full-v1` 成对验收（402dd68, SwiftShader）

状态：**blocked**。本目录不含卡片要求的 12 张 1280×720 成对图；完整 smoke 也在首个子运行 `current-default` 失败。以下为本次真实产物与首错，不表示画面、帧耗或默认采用已验收。

## 固定源与环境

- 源：`402dd688f6da351477036ab884614f9f38e4c46d`，tree `86416a9069072848626b3eb22981c701823a3fc6`。
- 拍摄要求：1280×720、DPR 1、FOV 80、SwiftShader、headless；**未取得**。
- 完整 smoke 实测：1365×900、DPR 1（脚本固定，未改）。
- Node `v24.22.1`，npm `10.9.8`，Chromium `156.0.8078.4`（Playwright `chromium-headless-shell`），原始 renderer/vendor/version 见 `environment.json`。
- smoke 启动参数：headless、`--use-angle=swiftshader`；保留 sandbox，实际 argv 无 `--no-sandbox`、无 `--enable-unsafe-swiftshader`。完整 argv 与 DEBUG 原始日志仅留本机，已脱敏。

## 摄影入口核对（为何没有 12 张图）

按卡片只读核对了原 `B-FPS-FIXED-CAPTURE-20261104` 已运行 harness 及其后继修正版：

| 入口 | SHA-256 | 固定 SHA 可换 | 两组 query 可配 | 唯一输出 | 正常关闭 |
|---|---|---|---|---|---|
| 原执行版 | `2035a2d1…` | 否 | 否 | 否 | 否，exit 1 |
| 清理/关闭修正版（同一旧输出根） | `3486d7c7…` | 否 | 否 | 否 | 是（交付版代码，未重跑） |
| 公开目录修正版 | `e838b270…` | 否 | 否 | 是（经 `FPS_CAPTURE_OUT_ROOT` 指向新根） | 是 |

`3486d7c7` 把 `OUT` 固定为旧目录 `outputs/B-FPS-FIXED-CAPTURE-20261104/fa8740d-swiftshader`，启动时只断言该旧根里已有 `preflight.json`；它没有 `FPS_CAPTURE_OUT_ROOT` 覆盖，不能指向本卡要求的、此前不存在的新唯一根。只有 `e838b270` 提供 `FPS_CAPTURE_OUT_ROOT` 与 `prepareOutputRoot()`，把根指向一个此前不存在的新目录时才算“唯一输出”（`capture-tool-gap.json` 中该条为 `uniqueOutputRoot: true`）。

三份都硬编码旧 `fa8740d` / tree `417652e6`，并在构建前断言 `HEAD`/tree；三机位 query 为固定字面量，没有 `materials=ai-courtyard-full-v1` 变体，也没有 query/commit 参数。按卡片不得改脚本、不得新建拍摄/验收 CLI、不得修改或忽略旧 SHA，因此未执行拍摄，也未创建 `outputs/B-FPS-DEFAULT-FULL-PAIR-20261112/402dd688f6da-swiftshader`。详见 `capture-tool-gap.json`。

## 完整 smoke 结果

命令：

```text
DEBUG=pw:browser FPS_SMOKE_RENDERER=software node tools/smoke-backlog.mjs --full-materials
```

- 真实退出码：`1`（`current-default`，query `''`）。
- 首错：`tools/smoke.mjs:125` 的 `page.waitForFunction` 30 秒超时，等待玩家在按下 `2` 后 `weapon === 'pistol'`。
- `--full-materials` 第二次运行未开始；脚本在第一次失败后停止。
- 六回合覆盖未完成：`round 1` 有 114 个活动帧样本，`round 2–6` 计数为 0，`fullMatchPlaythrough=false`。
- 清理：`browserDisconnected=true`、`previewPortClosed=true`；浏览器进程实际 `exitCode=0`。
- 原始 renderer：`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...), SwiftShader driver)`，`rendererClass=software`。

保留的 smoke 记录：`smoke/manifest.json`、`smoke/current-default/report.json`、`smoke/current-default/frames.json`（连续 rAF 原始样本）、`smoke/build.log`、`smoke/current-default/browser-events.log`。

## 下一步与边界

- 本批为 **blocked**：不改默认，不作画面判优或帧耗判据，本次 smoke 也不构成 402dd68 的可发布结论。
- 下一步由 owner 决定：开新卡，或授权一个能参数化固定 SHA 与两组 query 的拍摄入口；本单元受卡面“不改脚本、不新建拍摄/验收工具”限制，到此为止。
- 旧 `fa8740d` 的六张图与旧 harness 的 exit 1 运行记录只能作历史基线，不能当 402dd68 证据。
- raw smoke 根保留在本机（含 DEBUG 原始日志），本目录只是脱敏公开副本。

## 未完成

- 12 张 1280×720 成对 PNG 与逐拍元数据。
- `materials=ai-courtyard-full-v1` 子运行及六回合完整 smoke。
- 任何画面判优、默认变更或部署；声音与硬件画面不在本卡范围。
