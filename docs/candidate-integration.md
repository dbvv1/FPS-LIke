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
