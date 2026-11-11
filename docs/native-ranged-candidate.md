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

源内名称分别为 `2H_Ranged_Aiming`、`2H_Ranged_Shoot`、`2H_Ranged_Reload`，无需父节点重命名。消费器不鉴别文件来源，同 GLB 保证来自固定 hash 加载契约；验证唯一直接变换绑定、有限轨道与时长，复制 clip，不修改原始曲线或共享资源。`sample` 的相位由调用者负责；原 Game 快照适配器仍只负责旧 reload；新增显式 `syncKayKitNativeAction(actor, state, actorId)` 读取真实接受的步枪 shot、换弹快照，持枪静止时取源瞄准末帧。开火从源clip的0.25相位按原速度推进，连续接受shot重新采样。切枪改变的cooldown排除旧shot回放，移动/蹲下/交互/死亡/结算/手枪回rest（临时移动结束后若仍在同一shot有效窗内，可恢复其当前相位，不声称永久取消）；不提供该函数调用则旧行为不变。硬切换，不冒充过渡已做好。

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

侧移、后退、静步、蹲伏、交互、移动开火/换弹不在这条前跑源的语义内，返回 rest，供将来的 View 保留原角色。未选择新动作源、混合层或 IK。前跑到瞄准仍是硬切换；源内跑步是原地循环，实际速度与步幅未标定，脚滑、朝向、装备、剑盾处理及枪/弹匣接触须画面验收，不能以本接线宣称完整动作或品质通过。

```sh
node --import tsx tools/check-kaykit-rifle-movement.ts <fixed-sample-directory>
```

此命令要求 Knight、Med_CombatRanged、Med_MovementAdvanced 三个固定文件；缺参数/缺文件/错 hash 均失败。真实源 clip 0.833333313 s、72 轨：56 姿态与 208,096 个顶点的独立蒙皮比对通过，世界矩阵最大误差 0，蒙皮最大误差 1.80e-15 以下；首尾世界矩阵差 0、root 位移 0。实际 Game 的 5 个朝向共 60 个前跑快照消费同一固定 GLB，接回静止瞄准、开火和换弹；重复采样不改模拟 hash。这里的循环连续性是坐标证据，不是脚部接触、动作过渡或真实持枪视觉证据。

### 接 View 前先区分循环时长、骨位摆幅与接地步幅

当前前跑保持源速度，不能按脚骨前后极值直接算一个倍率。上述命令现在同时从真实候选身体以约 240 Hz（含首尾共 201 姿态）采样 `footl/footr/toesl/toesr`，并量五朝向实际 Game 的 60 个位移区间。固定源一圈 0.833333313 秒，游戏前移速度为 4.474554–4.500700 m/s，以各 tick 速度保持不变外推，每源周期将前移 3.728795–3.750584 m（不是连续完整周期实测）；原源坐标 Z 轴上的双脚骨范围约 0.6813/0.6821 m，双趾骨约 0.9883 m。源 root 不平移，因此不能从 root motion 自动读出匹配游戏速度的步幅。

**这组数不支持直接用“游戏每周期距离÷脚骨摆幅”倍速播放。** 摆幅同时含抬脚回摆，不是足底着地期间相对身体的后移距离；左右交替也不等于两倍摆幅。输出保留各骨位高度及有符号源 Z 轴速度范围（不冒充已验人物朝向），未用最低骨位当作鞋底、未猜接触帧。下一步须在现有真实蒙皮中确定鞋底接触点和着地区间，再对该区间比较角色平移与足底后移速度；得到可用合同后才考虑节奏调整，不能改玩法速度来遮掩脚滑。

本次只是固定来源的尺寸／时间标定，未识别真实地面接触，也未解决脚滑。保留 `contactIdentified=false`、`strideCalibrated=false`，不改动作速度、View、资产、main 或网站；枪械接触阻塞仍按原决定保留。这里的 Game 为原 1v1 模拟，并非离线训练赛的十人实玩证据。
