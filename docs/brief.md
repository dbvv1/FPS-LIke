# FPS-Like 设计任务书

**状态：排队**，MOBA-Like 完成第二次需求修改后开工；在此之前只修订本文件。设计变化直接改本文件；进度和阻塞写在 a1dbv TASKS。

## 目标

单个爆破点的回合制攻防：进攻方安放炸弹或全歼对手，防守方拆弹或守住时间。品质重点有三项：瞄准跟手、开枪有分量（后坐、声音、命中反馈）、机器人看不到就不开枪，靠声音和线索找人。

## 第一个可玩版本

- **地图**：一张小图，一个炸弹点，三条进攻路线，包含近距离拐角和中距离对枪位。
- **武器**：一把步枪、一把手枪，有弹匣、换弹、固定后坐图案和移动射击惩罚。
- **对局**：1v1 起步，模拟层按 3v3 设计；回合计时、安放与拆除、胜负与换边。
- **操作**：鼠标锁定视角，WASD 移动，蹲伏、静步、换弹、切枪。

## 要跑通的 a1dbv 模块

| 模块 | a1dbv 页面 | 在本案例验证什么 |
|---|---|---|
| 瞄准与命中 | [05 瞄准与命中](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/05-gameplay-architecture.md#瞄准与命中按失误类型改不只提高辅助强度) | 命中判定、头身部位、后坐与扩散按失误类型调整 |
| 镜头与角色控制 | [04 镜头](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/04-client-modules.md#camera-contract)、[04 角色运动](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/04-client-modules.md#character-control) | 第一人称镜头、加减速、台阶与斜坡、蹲伏 |
| 武器动画与换弹 | [动画：武器模块](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/assets/animation.md#weapon-animation-module)、[换弹](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/assets/animation.md#第四步换弹手离开枪是动作的一部分) | 握点、图层、换弹打断与切枪 |
| 命中反馈 | [04 打击反馈](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/04-client-modules.md#打击感与反馈先让命中有含义再让重击有分量) | 命中标记、受击方向、击杀确认 |
| 听声辨位 | [04 墙门后的声音](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/04-client-modules.md#墙门后的声音先选可听规则再选遮挡)、[音频](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/assets/audio.md) | 脚步、换弹、开枪的距离衰减与遮挡 |
| 射击 AI | [05 敌人失去玩家后](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/05-gameplay-architecture.md#p118-enemy-search-loop) | 视线感知、听声追踪、有限搜索与回防 |
| 性能 | [04 性能诊断](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/04-client-modules.md#压低卡顿与设备耗用) | 帧时间稳定性，输入到画面的延迟 |

## 技术默认

- **TypeScript + Vite，Three.js 渲染**；物理与角色控制用 [Rapier](https://github.com/dimforge/rapier.js) 的角色控制器和射线检测；机器人寻路用 [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)。
- **模拟**：60 Hz 固定逻辑帧，只接受输入命令，按“种子 + 命令序列”可复现。开枪命令带帧内时间和当时的视角，命中按开枪那一刻判定，不按下一个逻辑帧。
- **瞄准**：视角在每个渲染帧直接应用累计的鼠标位移，不等逻辑帧；指针锁定时请求 `unadjustedMovement`，绕过系统鼠标加速，浏览器不支持时回退普通锁定。
- **机器人**：只对有视线的目标开火；难度靠反应时间、预瞄误差和压枪能力区分，不靠穿墙信息或伤害加成。
- 换掉任何一项，在本节写一句理由。

## 自动验收目标

`npm run sim -- --games 200 --seed 1` 应满足：

- 0 异常，0 卡死，0 次对无视线目标开火；
- 同难度机器人按攻守统计：多个种子跑满 500 局以上，进攻方胜率在 40%–60%，用来检查地图攻守平衡；
- 高难度对低难度胜率不低于 80%，反应时间分布符合难度配置；
- 同一种子下后坐图案和重放状态哈希一致；
- 输出各武器命中率、爆头率和击杀时间，作为数值修改前后的对照。

瞄准跟手程度、后坐手感、脚步方向能不能听准，进入 a1dbv TASKS“待人工验收”。

## 里程碑

1. **可玩**：1 名玩家对 1 名机器人，完整回合、安放与拆除、换边；自动和浏览器验收通过。
2. **第二次需求修改**：加一把开火方式不同的武器（如霰弹或狙击开镜），并改动一条进攻路线。按 [05 §11](https://github.com/dbvv1/a1dbv/blob/main/domains/game-dev/05-gameplay-architecture.md#11-给-ai-第二次修改的最小契约) 记下改动范围、资源返工以及回放与数据兼容。
3. **扩展**：3v3、经济系统、第二个炸弹点，在第 2 步完成后再定。

## 不做

联网对战、匹配排位、皮肤、反作弊。

**依据**：[Rapier](https://github.com/dimforge/rapier.js)、[recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)（[一手]，2026-10-26 核仓库）；Pointer Lock 的 `unadjustedMovement` 选项见 MDN Element.requestPointerLock（[一手]，2026-10-26 读原文；页面未列各浏览器支持，开工时核）。验收区间是初始目标，首轮模拟后按实际数据校准。
