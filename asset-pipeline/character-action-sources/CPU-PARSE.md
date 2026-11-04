# KayKit 小样 CPU 解析报告

范围：本目录 `sample/kaykit/` 下 4 个公开 GLB，均为 Kay Lousberg（KayKit）CC0 内容。目的只是核对固定文件身份、节点/骨架/clip 名与通道数量，不评价姿势、接触、风格或游戏可用性。

## 1. 环境与工具

- 平台：Windows 11，本机命令行，CPU 文件处理。
- 解析器：Python 3 标准库 `struct` / `json` / `hashlib`，直接读取 GLB 的 JSON chunk 与 accessor 的 `min/max`，未安装任何依赖。
- **未使用 Three 0.186.1 的 GLTFLoader**：工作目录没有 `node_modules`，任务禁止安装依赖。因此本报告不能替代 `GLTFLoader` 的加载语义（节点名后缀、动画轨道绑定、纹理/材质解析）。这一项记为未验证。
- 未打开浏览器、GUI 或 GPU，未运行 Blender；没有对任何 clip 做视觉播放或姿势判定。

## 2. 固定文件身份

| 文件 | 字节 | SHA-256 | 结构 |
|---|---:|---|---|
| `Knight.glb` | 3,659,532 | `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168` | 15 mesh / 1 material / 1 image / 1 skin / 41 joints / 57 nodes / 76 clips |
| `Med_CombatRanged.glb` | 637,760 | `08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d` | 0 mesh / 1 skin / 23 joints / 24 nodes / 20 clips |
| `Med_MovementAdvanced.glb` | 331,200 | `5d309533953185acc19800ce8d89c13cba8a68986214cb87520496139cf418e2` | 0 mesh / 1 skin / 23 joints / 24 nodes / 13 clips |
| `Med_General.glb` | 460,024 | `628e5fa41d82787f2d779320b49946c318dd8564ec2611b2a1bba1c0f33a6819` | 0 mesh / 1 skin / 23 joints / 24 nodes / 15 clips |

合计 5,088,516 B（约 4.85 MiB），低于本卡 10 MB 小样上限。

来源与许可见 `sample/kaykit/PROVENANCE.md`。`Knight.glb` 来自 KayKit 作者组织的公开 GitHub 仓库；3 个 `Med_*.glb` 来自 sketchpunklabs 的 CC0 再导出（JSON 内没有 mesh，只有骨架与动画）。

## 3. 骨架与挂点

`Knight.glb` 的 41 个 joint：

```text
root, hips, spine, chest,
upperarm.l, lowerarm.l, wrist.l, hand.l, handslot.l,
upperarm.r, lowerarm.r, wrist.r, hand.r, handslot.r,
head,
upperleg.l, lowerleg.l, foot.l, toes.l,
upperleg.r, lowerleg.r, foot.r, toes.r,
kneeIK.l, control-toe-roll.l, control-heel-roll.l, control-foot-roll.l,
heelIK.l, IK-foot.l, IK-toe.l,
kneeIK.r, control-toe-roll.r, control-heel-roll.r, control-foot-roll.r,
heelIK.r, IK-foot.r, IK-toe.r,
elbowIK.l, handIK.l, elbowIK.r, handIK.r
```

`Med_*.glb` 的 23 个 joint 与上面同名核心骨完全一致（`root` 到 `toes.r`，含 `handslot.l` / `handslot.r`），没有 IK 辅助骨。也就是说：

- 两批文件的 23 个核心骨同名、同层级顺序；动画按骨骼名可以直接落到 `Knight.glb` 的对应骨上，缺失的 IK 辅助骨不会被轨道命中。
- 两只手各有一个 `handslot.l/r` 节点，可作为武器挂点；**没有独立弹匣骨、枪骨或手指骨**。
- `Knight.glb` 的 15 个 mesh 是同一角色的模块化部件，1 张 1024 图集；没有枪或弹匣 mesh。

## 4. 逐 clip 清单与时长

时长取每个 clip 所有 sampler 输入 accessor 的最大值。`*_Pose` / `T-Pose` 是 0 秒或接近 0 秒的姿态帧，不是可用动作。

### 4.1 `Knight.glb`（76 clips）

| # | clip | 秒 | channels |
|---:|---|---:|---:|
| 1 | `1H_Melee_Attack_Chop` | 1.0667 | 123 |
| 2 | `1H_Melee_Attack_Slice_Diagonal` | 1.0000 | 123 |
| 3 | `1H_Melee_Attack_Slice_Horizontal` | 1.0667 | 123 |
| 4 | `1H_Melee_Attack_Stab` | 1.6000 | 123 |
| 5 | `1H_Ranged_Aiming` | 1.0667 | 120 |
| 6 | `1H_Ranged_Reload` | 1.1667 | 122 |
| 7 | `1H_Ranged_Shoot` | 1.0667 | 120 |
| 8 | `1H_Ranged_Shooting` | 1.6000 | 101 |
| 9 | `2H_Melee_Attack_Chop` | 1.6333 | 98 |
| 10 | `2H_Melee_Attack_Slice` | 1.1000 | 94 |
| 11 | `2H_Melee_Attack_Spin` | 2.4000 | 98 |
| 12 | `2H_Melee_Attack_Spinning` | 0.6667 | 87 |
| 13 | `2H_Melee_Attack_Stab` | 1.6000 | 97 |
| 14 | `2H_Melee_Idle` | 1.0667 | 94 |
| 15 | `2H_Ranged_Aiming` | 1.6000 | 123 |
| 16 | `2H_Ranged_Reload` | 1.6000 | 109 |
| 17 | `2H_Ranged_Shoot` | 1.0667 | 123 |
| 18 | `2H_Ranged_Shooting` | 1.0667 | 108 |
| 19 | `Block` | 1.0667 | 123 |
| 20 | `Block_Attack` | 1.0667 | 123 |
| 21 | `Block_Hit` | 1.0667 | 123 |
| 22 | `Blocking` | 1.0667 | 123 |
| 23 | `Cheer` | 1.6667 | 123 |
| 24 | `Death_A` | 0.8000 | 123 |
| 25 | `Death_A_Pose` | 0.0000 | 83 |
| 26 | `Death_B` | 2.6333 | 123 |
| 27 | `Death_B_Pose` | 0.0000 | 83 |
| 28 | `Dodge_Backward` | 0.4000 | 123 |
| 29 | `Dodge_Forward` | 0.4000 | 123 |
| 30 | `Dodge_Left` | 0.4000 | 123 |
| 31 | `Dodge_Right` | 0.4000 | 123 |
| 32 | `Dualwield_Melee_Attack_Chop` | 1.2667 | 123 |
| 33 | `Dualwield_Melee_Attack_Slice` | 1.1667 | 96 |
| 34 | `Dualwield_Melee_Attack_Stab` | 1.6000 | 94 |
| 35 | `Hit_A` | 0.6667 | 123 |
| 36 | `Hit_B` | 0.8667 | 123 |
| 37 | `Idle` | 1.0667 | 123 |
| 38 | `Interact` | 1.3000 | 123 |
| 39 | `Jump_Full_Long` | 2.3333 | 123 |
| 40 | `Jump_Full_Short` | 1.1667 | 123 |
| 41 | `Jump_Idle` | 1.0667 | 123 |
| 42 | `Jump_Land` | 0.6667 | 123 |
| 43 | `Jump_Start` | 0.6000 | 123 |
| 44 | `Lie_Down` | 3.0000 | 123 |
| 45 | `Lie_Idle` | 2.6667 | 102 |
| 46 | `Lie_Pose` | 0.0000 | 102 |
| 47 | `Lie_StandUp` | 2.3333 | 123 |
| 48 | `PickUp` | 1.3000 | 123 |
| 49 | `Running_A` | 0.8000 | 122 |
| 50 | `Running_B` | 1.0667 | 123 |
| 51 | `Running_Strafe_Left` | 0.8000 | 123 |
| 52 | `Running_Strafe_Right` | 0.8000 | 123 |
| 53 | `Sit_Chair_Down` | 0.8000 | 123 |
| 54 | `Sit_Chair_Idle` | 3.6000 | 89 |
| 55 | `Sit_Chair_Pose` | 0.0000 | 85 |
| 56 | `Sit_Chair_StandUp` | 0.8000 | 123 |
| 57 | `Sit_Floor_Down` | 1.0000 | 123 |
| 58 | `Sit_Floor_Idle` | 4.0000 | 89 |
| 59 | `Sit_Floor_Pose` | 0.0000 | 84 |
| 60 | `Sit_Floor_StandUp` | 1.1333 | 94 |
| 61 | `Spellcast_Long` | 2.5333 | 123 |
| 62 | `Spellcast_Raise` | 2.1000 | 123 |
| 63 | `Spellcast_Shoot` | 0.9333 | 123 |
| 64 | `Spellcasting` | 0.6667 | 95 |
| 65 | `T-Pose` | 0.0000 | 123 |
| 66 | `Throw` | 1.3667 | 100 |
| 67 | `Unarmed_Idle` | 1.0667 | 123 |
| 68 | `Unarmed_Melee_Attack_Kick` | 0.9333 | 123 |
| 69 | `Unarmed_Melee_Attack_Punch_A` | 1.4667 | 123 |
| 70 | `Unarmed_Melee_Attack_Punch_B` | 1.6667 | 123 |
| 71 | `Unarmed_Pose` | 0.0000 | 123 |
| 72 | `Use_Item` | 1.6000 | 123 |
| 73 | `Walking_A` | 1.0667 | 123 |
| 74 | `Walking_B` | 1.0667 | 123 |
| 75 | `Walking_Backwards` | 1.0667 | 123 |
| 76 | `Walking_C` | 1.6000 | 119 |

**Knight 缺 `Crouching`**（Adventurers 包的 75 个动作里没有蹲行）；蹲行在 KayKit Character Animations 包，见下面的 `Med_MovementAdvanced.glb`。

### 4.2 `Med_CombatRanged.glb`（20 clips）

| # | clip | 秒 | channels |
|---:|---|---:|---:|
| 1 | `Rig_Medium\|Ranged_1H_Aiming` | 1.1000 | 72 |
| 2 | `Rig_Medium\|Ranged_1H_Reload` | 1.2000 | 72 |
| 3 | `Rig_Medium\|Ranged_1H_Shoot` | 1.1000 | 72 |
| 4 | `Rig_Medium\|Ranged_1H_Shooting` | 1.6333 | 72 |
| 5 | `Rig_Medium\|Ranged_2H_Aiming` | 1.6333 | 72 |
| 6 | `Rig_Medium\|Ranged_2H_Reload` | 1.6333 | 72 |
| 7 | `Rig_Medium\|Ranged_2H_Shoot` | 1.1000 | 72 |
| 8 | `Rig_Medium\|Ranged_2H_Shooting` | 1.1000 | 72 |
| 9 | `Rig_Medium\|Ranged_Bow_Aiming_Idle` | 1.8667 | 72 |
| 10 | `Rig_Medium\|Ranged_Bow_Draw` | 1.3667 | 72 |
| 11 | `Rig_Medium\|Ranged_Bow_Draw_Up` | 1.3667 | 72 |
| 12 | `Rig_Medium\|Ranged_Bow_Idle` | 1.6000 | 72 |
| 13 | `Rig_Medium\|Ranged_Bow_Release` | 1.3667 | 72 |
| 14 | `Rig_Medium\|Ranged_Bow_Release_Up` | 1.4000 | 72 |
| 15 | `Rig_Medium\|Ranged_Magic_Raise` | 2.1333 | 72 |
| 16 | `Rig_Medium\|Ranged_Magic_Shoot` | 0.9667 | 72 |
| 17 | `Rig_Medium\|Ranged_Magic_Spellcasting` | 0.7000 | 72 |
| 18 | `Rig_Medium\|Ranged_Magic_Spellcasting_Long` | 2.5667 | 72 |
| 19 | `Rig_Medium\|Ranged_Magic_Summon` | 4.3333 | 72 |
| 20 | `Rig_Medium\|T-Pose` | 0.0667 | 72 |

### 4.3 `Med_MovementAdvanced.glb`（13 clips）

| # | clip | 秒 | channels |
|---:|---|---:|---:|
| 1 | `Rig_Medium\|Crawling` | 1.1000 | 72 |
| 2 | `Rig_Medium\|Crouching` | 1.1000 | 72 |
| 3 | `Rig_Medium\|Dodge_Backward` | 0.4333 | 72 |
| 4 | `Rig_Medium\|Dodge_Forward` | 0.4333 | 72 |
| 5 | `Rig_Medium\|Dodge_Left` | 0.4333 | 72 |
| 6 | `Rig_Medium\|Dodge_Right` | 0.4333 | 72 |
| 7 | `Rig_Medium\|Running_HoldingBow` | 0.8333 | 72 |
| 8 | `Rig_Medium\|Running_HoldingRifle` | 0.8333 | 72 |
| 9 | `Rig_Medium\|Running_Strafe_Left` | 0.8333 | 72 |
| 10 | `Rig_Medium\|Running_Strafe_Right` | 0.8333 | 72 |
| 11 | `Rig_Medium\|Sneaking` | 2.1667 | 72 |
| 12 | `Rig_Medium\|T-Pose` | 0.0667 | 72 |
| 13 | `Rig_Medium\|Walking_Backwards` | 1.1000 | 72 |

### 4.4 `Med_General.glb`（15 clips）

| # | clip | 秒 | channels |
|---:|---|---:|---:|
| 1 | `Rig_Medium\|Death_A` | 0.8333 | 72 |
| 2 | `Rig_Medium\|Death_A_Pose` | 0.0667 | 72 |
| 3 | `Rig_Medium\|Death_B` | 2.6667 | 72 |
| 4 | `Rig_Medium\|Death_B_Pose` | 0.0667 | 72 |
| 5 | `Rig_Medium\|Hit_A` | 0.7000 | 72 |
| 6 | `Rig_Medium\|Hit_B` | 0.9000 | 72 |
| 7 | `Rig_Medium\|Idle_A` | 1.1000 | 72 |
| 8 | `Rig_Medium\|Idle_B` | 2.1667 | 72 |
| 9 | `Rig_Medium\|Interact` | 1.3333 | 72 |
| 10 | `Rig_Medium\|PickUp` | 1.3333 | 72 |
| 11 | `Rig_Medium\|Spawn_Air` | 1.3333 | 72 |
| 12 | `Rig_Medium\|Spawn_Ground` | 1.3333 | 72 |
| 13 | `Rig_Medium\|T-Pose` | 0.0667 | 72 |
| 14 | `Rig_Medium\|Throw` | 1.4000 | 72 |
| 15 | `Rig_Medium\|Use_Item` | 1.6333 | 72 |

## 5. 与目标仓动作合同的对照

目标仓当前 rigid 消费位置是 `src/render/content-set-assets.ts` 的 `ContentOpponent`：

- 只接受 `position` / `quaternion` 轨道，线性插值；节点必须已存在于固定场景，缺一个就报错。
- 必需 clip 名固定为 `idle` / `walk` / `fire` / `hit` / `death`。
- `hit` 与 `death` 的时长必须 ≤ `RESULT_HOLD_MS`（700 ms），否则在启用前拒绝。

对照本小样：

| 目标合同 | KayKit 小样实际情况 | 结论 |
|---|---|---|
| 5 个刚性组 `head/spine/leg-l/leg-r/weapon` | 41 骨 skinned 人形，15 mesh | 不能直接套 rigid 合同 |
| clip 名 `idle/walk/fire/hit/death` | `Idle`、`Running_A/B`、`2H_Ranged_Shoot`、`Hit_A/B`、`Death_A/B` | 必须做名称映射或新消费者 |
| `hit`/`death` ≤700 ms | `Death_A` 800 ms，`Death_B` 2633 ms；`Hit_A` 667 ms，`Hit_B` 867 ms | 部分超限；要么换 clip/裁切，要么改合同 |
| 只读绝对模拟时间的 position/quaternion | 每个 clip 41 或 23 个节点全量烘焙 translation/rotation/scale，root 也有位移 | 需要忽略 root XZ、只取姿势；不能用 AnimationMixer 的 delta 叠加 |
| 无 skinned motion | 本小样是 skinned 骨架 | 需要新增 SkinnedMesh/AnimationMixer 路径 |

## 6. 已验证与未验证

已验证：

- 4 个文件的字节数、SHA-256、JSON 结构、skin/joint 名单。
- 76 / 20 / 13 / 15 个 clip 的精确名称、时长、通道数。
- `handslot.l` / `handslot.r` 存在；没有 magazine/gun/finger 节点。
- KayKit Adventurers 的 `Knight.glb` 本身不含 crouch；crouch 与 `Running_HoldingRifle` 只出现在 Character Animations 包的再导出文件里。

未验证：

- 未用 Three `GLTFLoader` 加载（缺 `node_modules`，且本卡禁止安装依赖）。
- 未播放、未截图、未看姿势；解析通过不等于姿势合格或适合第三人称镜头。
- 未验证这些 clip 在 `Knight.glb` 的 41 骨上播放时 IK 辅助骨是否会产生额外偏移；未验证 23 骨动画与 41 骨 mesh 的实际混合结果。
- 未验证 KayKit Character Animations 免费档是否包含 `CombatRanged` 组（itch 页在本机不可达）。
- 未确认 `Death_A` 裁到 700 ms 后的可读性；这是合同层问题，不是解析结论。
