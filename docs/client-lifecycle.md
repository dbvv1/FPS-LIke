# 可玩客户端：失败终止与新局替换分开

状态：候选已接到默认 `offline-training-v1/client.ts` 的真实启动／运行／重开入口；基线 `fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8`。截至 2026-11-06 UTC，源码／CPU 接线通过，浏览器启动受环境限制，未合产品 main、未部署，不称玩家体验或品质通过。

## 玩家得到什么

- 场景启动或运行已不可用时，停止接收控制和排帧，释放本次资源，保留重新加载的错误提示。缓存返回、旧锁回调与迟到的新 Game 不复活失败页面。
- 只是重新开始的新 Game 创建失败时，原局仍在：回到现有暂停菜单，显示失败原因，可继续原局或重试。旧局不因替换失败被误销毁。

## 同一所有者，三种出口

| 事件 | 入口处理 | 资源与后续 |
|---|---|---|
| 致命启动／渲染／WebGL context loss | 先进入终态并撤 ready/running，再取消 RAF、解绑本客户端监听 | 按 controls → view → game → navigation → sound 清理；单个 dispose 抛错仍尝试其他所有者，保留主错误和清理错误 |
| 永久离开 pagehide | 与致命失败共用幂等终止 | 不再写旧 HUD；等待中的初始 Game／replacement 迟到后自己释放 |
| 正常 BFCache pagehide.persisted | 暂停并撤当前 RAF，保留所有者 | 正常 pageshow 可返回暂停菜单；已经终止的页面没有恢复资格 |
| 创建 replacement 被拒绝 | 尚未消费旧 Game，不进入终态 | 保旧局、回暂停菜单、解除 busy，可继续／重试 |
| replacement 已安装后 reset 失败 | 不能再假装旧局可继续 | 当前 Game 先接到所有者，再释放旧 Game；后半失败终止并清理新 Game |

**故障监听不是 ready 后才需要。** View 创建即已有 WebGL 上下文；监听必须在最终 canvas 确定后、导航／物理首个 await 前安装。只提前 pagehide 不覆盖初始化期间的 context loss。

**先比较现有做法，再补消费。** 原 FPS [CaptureLifetime](https://github.com/dbvv1/FPS-Like/blob/fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8/src/capture/lifetime.ts)已把迟到资源交给退出所有者释放，但它专用于捕获，不能把可恢复的新局失败都当退出。MOBA [lifetime](https://github.com/dbvv1/MOBA-Like/blob/c16d65395ab2ec772e492d5b42e6cf808fb6085d/src/render/lifetime.ts)分离各清理项、继续收尾的机制可借。本例只在已有 client 统一其资源出口，不引入通用资产缓存／音频框架，不改 HUD、玩法、音源或渲染配方。

## 实际回归

1. 新 6 项在原基线均失败：导航／Game 初始化失败、运行中 context loss、清理项抛错、迟到 replacement、可恢复重开。不是修改断言掩盖既有问题。
2. 独审发现监听过晚；再加导航／初次 Game 挂起期间 loss，两项先失败，提前监听后通过。
3. 新增 replacement 安装后 reset 失败的终态，以及真实 Rapier-backed Game：替换拒绝前后 hash 不变，沿生产 client 继续后 tick／hash 前进，永久离开后 Game 拒绝再次 step。
4. 新文件 `tests/offline-training-v1/client-terminal.test.ts` 共 10 项通过；其中控制／DOM／视听与故障为替身，一项用真实 Game／Physics。原 client-loading／client-restart 的正常、永久离开、迟到拒绝与 persisted 返回仍保留；原重开失败断言更新为可继续的暂停菜单，不再显示致命页。
5. 2026-11-06：全量 `npm test` **440/440**、`npm run typecheck` 与 `npm run build` 通过；锁文件 SHA-256 为 `390c5619c464e5b164be3bf472bb41d0bfd3cc63d0309e21909026addf7f5e3c`，复用现成依赖。独立审查在补齐早期 context loss 后通过；不以这些结果替代浏览器门槛。

复跑：`node --import tsx --test tests/offline-training-v1/client-terminal.test.ts tests/offline-training-v1/client-loading.test.ts tests/offline-training-v1/client-restart.test.ts`，然后 `npm test` 与 `npm run build`。

## 浏览器门槛尚未通过

`tools/check-client-terminal-browser.mjs` 已准备：构建默认十人入口，静音后普通点击进入→Esc 暂停→继续，通过真实 `WEBGL_lose_context` 注入上下文丢失，核 ready/running、RAF 停止、旧回调与 resize 无复活，再重新加载并普通进入。它不截图、不播放声音、不注入玩法状态。合成 pageshow 只核恢复资格，不冒充真实 BFCache 准入／往返。

本轮仅启动一次 Chromium，页面尚未建立便因 `process_singleton socket() failed: Operation not permitted` 以 SIGABRT 退出。Playwright 监听的预览服务已关闭。请求配置为 headless、软件 SwiftShader，显式移除默认 `--enable-unsafe-swiftshader`；依据既有授权仅关闭 Chromium 自身 sandbox，外层环境限制未修改。未重试或改路绕过。

在获准且可用的环境补 `npm run build && node tools/check-client-terminal-browser.mjs`；程序默认启用 Chromium sandbox。真实 GPU context loss、浏览器 BFCache、现场资源驻留与网站采用均未验。完成浏览器门槛后再按精确 parent 快进合 main／更新网站；与 HUD、交火反馈和 Star 出图独立。
