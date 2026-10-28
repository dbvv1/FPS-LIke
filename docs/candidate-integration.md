# 旁置候选的隔离与验收

角色内容来自 a0c8d52，包含 02d5328 的动画时长修复；拍摄基础来自 016897b → febed02。默认 main 的最新 brief 保留。

`?gameplay=movement-v2` 独立载入 `src/candidates/movement-v2/client.ts`。这个命名空间是上述整合树的冻结副本，叠入 fca31b0 的 src 变化；只重定位静态资源 URL，不修改默认模拟、武器调参、HUD 或重放版本。复制是暂时的发布隔离，而非第二套默认实现；后续共同修复须对两套入口复验。未知或重复 gameplay 参数不启用候选。角色参数可以组合；capture 参数始终进入只读拍摄客户端；该客户端暂不支持异步角色内容，shot 与 contentSet 同时出现会明确报错，不生成虚假的固定帧证据。

## 自动门槛

- `npm test`：默认 v1 固定回放、内容加载与动作时长、capture 隔离、候选 v2 固定回放、运动/射击/物理 checkpoint。
- `npm run build`、`node tools/smoke-headless.mjs`：生产构建与构建后的离线模拟。
- `npm run sim -- --games 200 --seed 1`：默认机器人回合。
- `node --import tsx tools/sim-movement-v2.ts --games 200 --seed 1`：候选机器人回合。
- `npm run smoke:backlog`：从干净的固定 commit 重建，串行检查默认、角色、移动、组合四个实际浏览器入口和 capture。每轮独占 outputs/backlog-smoke 目录，记录源 commit/tree、构建文件 SHA256、页面内输入、渲染器原文、截图、浏览器退出日志。默认使用软件 WebGL；设置 FPS_SMOKE_RENDERER=native 使用默认驱动，仍以实际 renderer 分类，不由选项推定 GPU。FPS_SMOKE_CHROMIUM 可指定已安装的 Chromium。

smoke 保留 sandbox、仅 headless，不允许可见窗口或操作桌面。页面内输入仅用于 smoke，不把它当真人操作或输入到显示延迟证据。云端 socket EPERM 已知时，将固定版本和完整命令交既有接收端，不靠关闭 sandbox 重试。

实际浏览器通过之前不合 main、不更新网站；通过后旁置交付，不表示手感或画面胜出，也不切换默认。

## 离线训练赛候选

固定源 `101b85b7031fef7b9d718311603604b972bff6f7` 的完整模拟、客户端和环境放在 `src/candidates/offline-training-v1/`。除三个共享 JSON 素材的相对 import 重定位，其产品源码保持原样；增加独立 entry 懒加载原候选样式。基底为 `74fef20a23d156a9242ff633c966d94cfb95dd58`，默认、characters-v1、movement-v2 与原 capture 的源码、素材及依赖锁均按 hash 回归，不修改原入口。

[已上线 v14 的离线训练赛](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1)：1 人＋9 机器人、六回合、第三回合后换边、整场结算和重开，以及原庭院表面材质候选。不包含技能、双点、经济或联网；也未合并 movement-v2 / characters-v1。`shot` 或 `contentSet` 组合明确报错，不冒称拍摄或角色内容生效；去掉全部参数返回默认。环境只在 Three 路径生效，CPU 回退不表示材质验证通过。

`npm test` 包含原候选完整 CPU 回归（重定位测试 import）与路由/基底隔离测试。`npm run sim:offline-training -- --seed 1 --seeds 5 --replay` 跑五种子、每种子六回合及重放比较，输出职责、无视线射击和完成统计。该整合运行源 `19f718eb` 已随 `1125fc4` 合入 main，并上线 v14：323 项 CPU 测试沿用已验结果，新入口真实 GPU 页面 smoke 已通过，网站 19 文件与被测构建逐 SHA-256 一致。原 `101b85b` 已由本集成接收，不再单独待 GPU；这不等于完整六回合或人工品质验收，原 v13 四入口证据仍单独保留。此整合不重新制作或评价美术；环境原有差距见 [环境候选](quality/environment-candidate.md)。

## 离线旁置入口的页面 smoke

2026-10-28 的 [固定回执](quality/smoke/B-FPS-OFFLINE-SMOKE-20261028/19f718ebd557-E2mXmf/manifest.json)与[页面报告](quality/smoke/B-FPS-OFFLINE-SMOKE-20261028/19f718ebd557-E2mXmf/report.json)已验证以下首回合／下一回合／全场重开流程；接收端使用 Node 22，未在要求的 Node 24+ 重跑。

`npm run smoke:offline-training` 构建干净的固定提交后，仅验
`?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1`。
不重复四个旧入口或 capture；其源码隔离仍由路由测试与 v13 baseline 哈希回归检查。

此命令使用真实 headless 页面输入，不改模拟时间或状态：核对九个 bot、十名角色、六回合 HUD 与 courtyard active；移动、瞄准、开火、换弹中断、暂停冻结和恢复；自然等待第一回合结束（最多 120 秒），用 UI 进入第二回合，再“重新开始”清空整场记录和比分。当前 UI 没有独立的“仅重开本回合”动作。
**这不是六回合实玩验收**：半场换边、六回合终局与终局“再打一场”、人工画面/听感仍未覆盖。任何首回合超时或输入断言失败都使 smoke 失败，不回退为模拟通过。

每次独占 `outputs/offline-training-smoke/<commit>-<unique>/`，保留 source commit/tree、构建文件 SHA-256、页面报告与 `DEBUG=pw:browser` 日志；报告区分原始 renderer 与 gpu/software/unknown，并核对自有浏览器 PID 的零码退出、断连及预览端口关闭。Windows 构建复用现有 npm 调用。默认保留 sandbox、精确移除 unsafe SwiftShader 默认参数；可沿现有 `FPS_SMOKE_CHROMIUM` 与 `FPS_SMOKE_RENDERER=native` 配置选择执行器，不启动可见窗口。原始输出含执行环境信息，公开前需脱敏扫描。
