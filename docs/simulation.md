# 接入模拟层

渲染器使用 `Game.state` 的快照；每个逻辑帧只调用一次 `Game.step(commands)`。模拟不引用 DOM、Three.js、网络或系统时间，Node 与浏览器客户端共用这一份规则。

```ts
import { Game } from '../src/sim/index.js';
const game = await Game.create(1);
game.step([
  { actorId: 'amber-1', type: 'move', x: 0, z: 1 },
  { actorId: 'amber-1', type: 'shoot', yaw: 0, pitch: 0, at: 250 },
]);
const frame = game.state; // 副本，不会回写模拟
// 对局结束后 game.nextRound()；卸载时 game.dispose()。
```

- 固定 60 Hz。`at` 是当前逻辑帧内的整数千分位，范围 0–999，默认 0。动作前先推进所有角色到该时刻，再用开枪命令自带的视角做 Rapier 射线检测。`state.time` 与 `state.roundEndsAt` 以 1/60000 秒计数；炸弹安放后倒计时读 `state.bomb.explodeAt`。
- `move` 接受世界 X/Z 方向并归一化，另有 `walk`／`crouch`；输入保持到下一条同类命令。`aim` 更新视角，`shoot` 只触发一次。换弹用 `reload`、切枪用 `switch`，安放／拆除用 `interact: held`。
- 客户端每渲染帧即时累计鼠标位移，在发枪时记录视角和帧内时刻，不应先等一次模拟 tick。加减速、台阶／斜坡地图和输入到画面延迟仍需客户端集成验证。
- 同一批非法输入在改变状态前整体拒绝。保存初始种子、玩家名单、规则、每帧命令数组和 `nextRound` 边界，可重放并逐帧对比 `stateHash`。哈希用于同版本回归，不是跨版本存档协议。
- `Game.observe(id)` 只给机器人自己的状态、视野内敌人的位置与蹲伏姿态、可听声音的发生位置和公开目标信息。敌人的血量、弹药和墙后位置不进入机器人接口。声音线索不会随发声者移动；失去视线后只寻路搜索，不开火。
- 地图定义在 `src/content/map.ts`。改图后运行 `npm run bake-nav`，提交更新的 `navigation.json`；运行时只导入离线 Recast 结果，地图哈希不匹配就拒绝加载。无需从渲染几何重新建导航。

规则与导出的地图／武器／难度定义均为只读冻结对象。要做数值对照，修改源数据并重新运行，不在活跃对局里改共享配置。多人交互优先保留仍然有效的拆弹者；队友稍后加入不会清掉其进度，原拆弹者中断后才重新选人并从零计时。机器人排队射击执行前再次检查目标：若目标被同帧更早的动作击杀或失去视线，该枪取消且不消耗弹药；玩家仍可自由向掩体射击。

## 本地检查

```sh
npm test
npm run build
npm run smoke:headless
npm run sim -- --games 200 --seed 1
```

`build` 产出可导入的 `dist/fps-sim.js` 模拟库和 `web-dist/` 客户端；`smoke:headless` 实际导入模拟产物，验证导航和完整回合。它不是浏览器 smoke。`dev` 提供本地客户端，`smoke` 严格要求真实 WebGL2 上下文；CPU 回退的验收范围见 [客户端接入](client.md)。

批量报告的 `exceptions` 是异常，`stalls` 是 6000 帧仍未结算，`reasons.timeout` 是正常规则超时；三者分别统计。`botNoLosShots` 核对实际发出的子弹与当时目标视线；武器没有发射样本时比率为 `null`。击杀时间从该目标首次受伤计到死亡，不含第一次接敌时间。攻守平衡和难度优势仍以 brief 的多种子区间为目标，不能用无异常代替这些数值检验。

实现使用锁定版本的 Rapier（Apache-2.0）与 recast-navigation（MIT）；原始地图与数值由本项目编写，无商业游戏资产。依赖许可见各 npm 包及 `package-lock.json`。

## 首轮结果与下一步

2026-10-26 的固定种子 1v1 批测：200 局进攻方胜率 63.5%，另 500 局为 61%，仍高于 40%–60% 目标；自然机器人局全部由淘汰结算。安放、拆除、超时和换边已由规则回归覆盖，尚不能据此判断机器人完整爆破战术或人类对局节奏。两组攻守互换的 hard/easy 共 500 局，高难度全部获胜；这些 1v1 批测均无异常、无超过 6000 帧未结算、无无视线目标开火。

客户端已接入同一模拟，未改动本节数值。下一步把地图接敌节奏、攻守平衡和目标行为放在同一轮调参；完整 WebGL 浏览器验收与操作手感仍待完成。
