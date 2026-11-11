# 从现有角色原生动作补齐小范围射击链

## 目标

不等待另一个“完整免费包”，先消费已经固定并解析过的 Knight 自带双手瞄准、单次开火、换弹。保留现有跨骨架两类 reload 调用与默认角色。此页是可执行候选，不是画面验收或完整战术角色供给结论。

## 做法

使用固定 KayKit 样本的 Knight GLB（SHA-256 `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`）。把同次 GLTFLoader 解析得到的 `target.animations` 作为可选 `nativeAnimations` 传给 `KayKitSkinnedCharacter`；省略则仍仅加载原先两类 reload。显式传入后缺任何指定原生 clip 都失败回退，不悄悄播放半套。

```ts
const actor = new KayKitSkinnedCharacter({
  character: target.scene, motion: ranged.scene, animations: ranged.animations,
  nativeAnimations: target.animations,
});
actor.sample('native-aim-two-hand', 0.5);
actor.sample('native-fire-two-hand', 0.25);
actor.sample('native-reload-two-hand', 0.75);
actor.stop();
actor.dispose();
```

源内名称分别为 `2H_Ranged_Aiming`、`2H_Ranged_Shoot`、`2H_Ranged_Reload`，无需父节点重命名。消费器不鉴别文件来源，同 GLB 保证来自固定 hash 加载契约；验证唯一直接变换绑定、有限轨道与时长，复制 clip，不修改原始曲线或共享资源。`sample` 的相位由调用者负责；原 Game 快照适配器仍只负责旧 reload；新增显式 `syncKayKitNativeAction(actor, state, actorId)` 读取真实接受的步枪 shot、换弹快照，持枪静止时取源瞄准末帧。开火从源clip的0.25相位按原速度推进，连续接受shot重新采样。真实切枪取消事实排除旧shot回放（旧步枪快照沿用cooldown兼容判断），移动/蹲下/交互/死亡/结算/手枪回rest（临时移动结束后若仍在同一shot有效窗内，可恢复其当前相位，不声称永久取消）；不提供该函数调用则旧行为不变。硬切换，不冒充过渡已做好。

## 一个失败反例

把“另一个官方免费动画包的 CombatRanged 清单未取回”推导成“当前 Knight 没有可用开火/换弹”会误停制作。固定 Knight 的 76 条 clip 已包含上述三条。反过来，有这三条也不能宣布完整供给：实际文件只有手部挂点，未提供枪/弹匣/手指节点；角色还带剑盾，需要后续实际观看、装备处理及接触核验，不能新建 IK 掩盖缺口。

## 可直接运行

```sh
npm run check:kaykit -- <fixed-sample-directory>
npm test
npm run build
```

真实固定 GLB 的 CPU 检查：三条原生动作 274 次采样（60 Hz、倒回、末帧、重启），全部节点世界矩阵对独立源 mixer 最大误差 0，1,018,184 次蒙皮顶点包围盒/球检查通过；旧跨骨架检查仍通过。该轮（2026-11-10）测试 444/444，构建退出 0。纹理未解码、无浏览器或硬件 GPU 出图，未接 View，默认未变，内容覆盖仍 0/77。当前决定为继续补验：dot-B 负责源内动作/后续事件消费；真实装备接触、视觉过渡与完整 smoke 在实际出图链恢复后验，不把本 CPU 结论写成品质得分。


快照消费新增后，固定源GLB实际蒙皮也走真实Game开火→换弹→切枪，重复暂停快照姿态不变、模拟hash不变。单测覆盖倒回与切枪再切回不播放旧shot；未接生产View，也未解决枪口朝向、接触或动作过渡。这是同一候选的接线，不新增动画来源或运行时开关。


## 从固定移动源接入真实前跑状态

`rifleMovement` 可选输入继续使用既有 `Med_MovementAdvanced.glb`，只取 `Rig_Medium|Running_HoldingRifle`。该文件 SHA-256 为 `5d309533953185acc19800ce8d89c13cba8a68986214cb87520496139cf418e2`；来源及 CC0 说明随[固定小样](https://github.com/dbvv1/FPS-Like/blob/78a892c6cf057ddb63b4fc21daafdd7e4313453a/asset-pipeline/character-action-sources/sample/kaykit/PROVENANCE.md)。它是既有再导出样本，不代表官方免费档完整清单已核。不新增下载或生产 URL。

```ts
const actor = new KayKitSkinnedCharacter({
  character: target.scene, motion: ranged.scene, animations: ranged.animations,
  nativeAnimations: target.animations,
  rifleMovement: { motion: movement.scene, animations: movement.animations },
});
const previous = game.state;  // Game.state 是独立快照，必须在 step 前保存。
game.step(commands);
const current = game.state;
syncKayKitRifleAction(actor, current, actorId, previous);
```

这是既有消费者上的身体动作链：静止复用原生瞄准/开火/换弹，前跑用新动作；没有在 `View` 注册。新增的 `syncKayKitRifleAction` 在移动分支只接受同种子、同回合、同角色且相邻 tick 的前后快照；静止分支沿用不需要前帧的原生动作合同。`Game` 的移动输入为世界空间，前向是 `(sin(yaw), cos(yaw))`；输入和实际位移都须与朝向一致。只按住前进但被墙挡住时不播放跑步。沿 Game 现有脚步的 1 mm 位移门槛过滤 Rapier 接触微动，允许每 tick 不超过 1 mm 的横向接触修正。

相位取权威模拟时刻 `state.time / SECOND` 对源时长取余，重复采样、暂停及回放同一对快照不会积累渲染帧误差。调用方暂停时保留最后一对快照，不以同一快照替换前后两份；新局销毁旧消费者，移动分支缺前帧或跨 tick 跳跃时保持回退，不猜中间运动。所有循环时刻均由调用者提供，`sampleLoop('run-rifle', seconds)` 不自行看墙钟；旧 `play` 仍为单次播放，`sample(..., 1)` 保留源末帧。

前跑的开火排除也消费同一 `currentRifleShot` 选择器：已被实际切枪取消的历史 shot 不再阻止前跑，新接受射击仍回退，不能把保留的命中／音效历史当成仍活跃的动作。

侧移、后退、静步、蹲伏、交互、移动开火/换弹不在这条前跑源的语义内，返回 rest，供将来的 View 保留原角色。未选择新动作源、混合层或 IK。前跑到瞄准仍是硬切换；源内跑步是原地循环，实际速度与步幅未标定，脚滑、朝向、装备、剑盾处理及枪/弹匣接触须画面验收，不能以本接线宣称完整动作或品质通过。

```sh
node --import tsx tools/check-kaykit-rifle-movement.ts <fixed-sample-directory>
```

此命令要求 Knight、Med_CombatRanged、Med_MovementAdvanced 三个固定文件；缺参数/缺文件/错 hash 均失败。真实源 clip 0.833333313 s、72 轨：56 姿态与 208,096 个顶点的独立蒙皮比对通过，世界矩阵最大误差 0，蒙皮最大误差 1.80e-15 以下；首尾世界矩阵差 0、root 位移 0。实际 Game 的 5 个朝向共 60 个前跑快照消费同一固定 GLB，接回静止瞄准、开火和换弹；重复采样不改模拟 hash。这里的循环连续性是坐标证据，不是脚部接触、动作过渡或真实持枪视觉证据。

### 先验身体与运动源的地面适配，再标定步频

**当前固定重导运动源＋Knight 组合不能直接作为已接地的前跑动作采用。** 保留其 CPU 姿态传递、循环和真实快照消费结论；先验源动作与目标身体的足底匹配，不按骨位摆幅调倍速，也不为消除某个最低点自动抬根或加 IK。该动作尚未接 View，不改变现有游戏默认。

上述命令同时核实际鞋底表面：固定 Knight 两腿的静止平底各有 31 顶点、13 三角形，按原始运动 rig／clip 与 Knight inverse bind 独立蒙皮，再与生产消费者比较。201 个相位的两路最大误差低于 2e-15 m；相对各腿静止底面，左右最低点分别约低 8.37／8.52 cm。父节点重命名没有引入这组差异，统一减去静止高度也不能消除它。这里的平面只是源几何参考，未观测真实游戏地板；结论只覆盖固定的重导 GLB 与 Knight，不归因未取得的官方 FBX。

当前游戏前移约 4.47–4.50 m/s，源周期约 0.833 s，但骨位摆幅包含抬脚回摆，静止平面附近的采样也不是接触区间。下一步先定身体、动作和地面的适配合同，再比较接触期间角色前移与足底后移；之后才决定步频和过渡。保持 `contactIdentified=false`、`strideCalibrated=false`，未识别实际着地、未解决脚滑，枪械接触阻塞仍保留。Game 的 CPU 检查为原 1v1 模拟，不是离线训练赛十人实玩。


## 步枪身体与装备选择

既有原生动作消费现在在实例内隐藏三把剑和四面盾：`1H_Sword_Offhand`、
`1H_Sword`、`2H_Sword`、`Badge_Shield`、`Rectangle_Shield`、`Round_Shield`、
`Spike_Shield`。六个具名身体网格与 `Knight_Helmet`、`Knight_Cape` 保留源可见性，
不删除网格、骨骼或披风，不修改共享源。原生瞄准／射击／换弹以及同实例的步枪前跑
消费该选择；stop、旧跨骨架动作及退出原生快照语义恢复各网格原始可见性。

只有启用 nativeAnimations 的固定 Knight 装配使用该选择；纯旧跨骨架动作适配不变。
提供 nativeAnimations 时先验证这十五个唯一 Mesh；缺网格、重名或非 Mesh 不接受。
实际 Game 快照的瞄准→射击→换弹→切手枪已覆盖选择和恢复，固定源检查仍比较
原动画矩阵与蒙皮边界。该变化是既有候选内的身体准备，**没有接 View，也没有装配 RX24**。

站姿模拟有半轴 0.55 m／半径 0.30 m 的移动胶囊和中心高 1.62 m／半径 0.22 m
的头部命中球；这些碰撞规格没有规定 Knight 的艺术比例适配。因此本次不缩放人物、
不修改碰撞体、不抬根、不调动作倍速。真实掌面、枪械接触、地面适配和画面验收仍待完成。
