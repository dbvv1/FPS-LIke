# 交火反馈跨回合时间线验证（offline-training-v1）

固定源为 FPS-Like `fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8` 的 `src/candidates/offline-training-v1/{sim/game,render/feedback,render/weapon,session/match}.ts` 与既有 `tests/offline-training-v1/{feedback,match,shot-cycle}.test.ts`。2026-11-09 在 main `876fb20` 上重新接收：4 项新增回归、全量 434 项、类型检查与生产构建通过。本页只记录 CPU 语义验证；不是枪感、听感或画面验收，也没有运行浏览器、headless、GPU 或音频设备。

新增跨模块断言：`tests/offline-training-v1/feedback-timeline.test.ts`。未改 `src`、旧 golden、结果卡或声音源。

## 给下一次真人验收

这一节是给下一次枪感验收者的可执行入口；后面的表格只证明 CPU 语义，不代替实玩。

### 1. 先跑命令带

在仓库根目录执行：

```text
node --import tsx --test tests/offline-training-v1/feedback-timeline.test.ts
```

期望 4 个测试全部通过（见下方“运行结果”）。这是本命令带唯一的逐 tick 重放入口。

### 2. 这条带只存在于测试里

- 测试直接创建 3 个 Actor：`player`（amber，出生 (0,0,0)）、`ally`（amber，出生 (2.5,0,0)）、`enemy`（blue，出生 (0,0,5)），并在停止点 (0,0,0.75) 按精确 yaw/pitch 瞄准；种子 13、60 Hz、所有命令 `at=0`。
- 客户端没有加载这条带的入口，不能逐 tick 重放上表数值。`src/candidates/offline-training-v1/capture/replay.ts` 是另一条回放：9 个机器人与玩家 `move 0,0` 共 120 tick，只服务 capture，不是本带。
- 客户端可玩入口是 1 人＋9 机器人的六回合训练赛，出生点、机器人移动和瞄准都与测试不同；下列动作只按“同一类现象”对照，不追同一坐标或同一帧。

### 3. 最接近的可玩动作序列

```sh
npm run dev
```

打开终端打印的本地地址，追加：

```text
/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1
```

`match=complete-v1` 提供六回合与 summary，`squads=offline-v1` 提供 1 人＋9 机器人。只用 `?gameplay=offline-training-v1` 是 1v1，没有友军，只能对照其中一部分节点。

按下面顺序操作，逐项对照：

1. 轻按 W 前移约一步（本带为 10 tick、0.75 m），松开后确认不再漂移。
2. 对近处墙面开一枪步枪：有枪口闪光、枪身后坐和约 180 ms 的墙面落点亮点；不应出现命中标记。
3. 瞄准敌方身体开一枪：出现命中标记，敌人有约 180 ms 的受击晃动。HUD 不显示敌方血量，别用肉眼血量反推伤害。
4. 瞄准队友身体开一枪：HUD 显示“友军命中”；友军实际掉血，但 summary 的 `hits` 不计这一发。
5. 朝天（抬高枪口，确保射线越过围墙、不命中墙或人）开一枪：无落点（`range` 不绘制落点），无命中标记。朝围墙/场外水平射击会得到 `world` 落点，不属于本项。
6. 按 R 开始换弹，然后在换弹中按左键：弹药数不变、无新的枪口闪光、无新落点；这就是“换弹中开火无 Shot、无反馈”。若枪身仍有残余后坐，它来自上一发，不是这次开火。
7. 换弹未完成时按 2 切手枪：换弹取消、步枪保留剩余弹药；切枪后有 12 tick（200 ms）开火锁，本带等待 13 tick 再开火；当前正式打断只有切枪，没有单独的取消换弹命令。
8. 用手枪命中敌方身体：出现命中标记和受击晃动。
9. 按 1 切回步枪，进攻方击倒最后一名敌人，或防守方在安放前击倒最后一名敌人：回合结算（安放后防守方仍须拆除），先显示“击倒确认”，未被菜单操作打断时，客户端安排 700 ms 后打开回合菜单。

对照项：

- **结算后 700 ms 死亡尾段**：本带结算当 tick 的击杀事件年龄为零，Feedback 在结算后 700 ms 移除它；旧事件按模拟年龄加结算后经过时间累计满 700 ms 移除，暂停不延长该窗口；客户端暂停按钮会清除菜单延迟并立即打开菜单。这些测试不执行按钮或验证遮挡后的可见效果。
- **换弹中开火**：无 Shot、弹药不扣、无枪口闪光/落点。
- **切手枪打断换弹**：`reload` 结束，弹匣保留已消耗数量（如 20/24 发）。
- **Feedback 年龄**：HUD 不直接显示这个数字；HUD 的“击倒确认”另读模拟时间，不保证随 Feedback 同时消失。可见代理是落点/受击晃动约 180 ms、枪口闪光约 65 ms、击杀倒地尾段 700 ms。暂停时模拟时间冻结，这些年龄不随暂停墙钟增长（结算后的 700 ms 尾段除外，它按显示墙钟走）。
- **summary 的 shots/hits/headHits**：回合菜单的“命中 X / Y 发 · 要害 N”只统计玩家 Shot；换弹中按下的射击没有 Shot，不计入；友军命中不计入 `hits`；`headHits` 是敌方命中里的头部数。每回合结算时累加，整场到第 6 回合；单回合数值看相邻两次结算的差值。

命令带里的 tick、坐标、角度、伤害和 6/3/1 统计只对测试有效，不能拿来核对真人回合的具体数值。

### 4. 这些不能据此判断

- 不能判断枪感、听感或画面质量；本节只给出对照动作，主观结论仍需真人实玩。
- 没有测量浏览器实际帧率、输入延迟或掉帧；测试里的 30/60/120 Hz 只是取样模型。
- 没有接入旧存档导入；客户端实玩使用当前 `Game` 新建的对局。

## 运行结果

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过 |
| `node --import tsx --test tests/offline-training-v1/feedback-timeline.test.ts` | 4 个测试全部通过 |
| `npm test` | 434 个测试全部通过，0 失败 |

## 命令带

只通过 `Game.step(commands)` 和 `Game.nextRound()` 推进；测试不写 Actor、Shot 或 result。种子 `13`，60 Hz 固定步长，`roundTicks=180`（回合 2 的零射击超时用）。

| 项 | 值 |
|---|---|
| 玩家 | `player`，amber，round 1 出生 (0, 0, 0)，`yaw=0` |
| 友军 | `ally`，amber，round 1 出生 (2.5, 0, 0) |
| 敌人 | `enemy`，blue，round 1 出生 (0, 0, 5) |
| 移动 | tick 0–9 每 tick `move(0,1)`，tick 10–11 `move(0,0)` 停止 |
| 步枪间隔 / 换弹 | 6 tick / 114 tick |
| 手枪间隔 / 换弹 | 15 tick / 84 tick |
| 回合 2 | 不提交任何命令，180 tick 后由权威 timeout 结束 |

所有命令 `at=0`；`tick` 是提交前的模拟 tick。玩家在 tick 10 后停在 z≈0.74981（10 tick 移动 0.74981 m，含物理控制器微小修正），tick 11 不再漂移。

## 单条时间线（60 Hz 实跑记录）

`ShotImpact` 取当次 Shot 的权威射线；`Feedback 年龄` 是观察 tick 时该 Shot 在 `Feedback` 中的年龄（发射后一个 tick = 16.667 ms，结算当 tick 的击杀 Shot = 0 ms）。`localShotResult` 只读该 Shot 当时的 `impact.killed` 与命中对象，不读当前 HP。`Match` 列在回合结算前为 0 回合。早期 4 发在结算前已各自超过 700 ms 并从 `Feedback` 移除；结算当刻只剩 pistol body（433.333 ms）和 kill（0 ms）两个事件。

| 节点 | 命令 tick/at | 观察 tick/time | 权威 ShotImpact | Feedback 年龄 | weaponPose kick/flash | localShotResult | 玩家武器/弹药 | 关键 HP | Match |
|---|---|---|---|---|---|---|---|---|---|
| 前进 | 0 / 0 `move z=1` | 1 / 1000 | — | — | 0 / 0 | — | rifle 24 | 全员 100 | 0 回合 |
| 停止 | 10 / 0 `move 0,0` | 11 / 11000 | — | — | 0 / 0 | — | rifle 24 | 全员 100 | 0 回合 |
| 步枪打墙 | 12 / 0 `shoot(yaw=-π/2,pitch=0)` | 13 / 13000 | `world`，(0,1.62,0.75)→(-3.4,1.617,0.745)，长 3.4 m；hit=null | 16.667 | 1.051 / 0.744 | miss | rifle 23 | enemy 100 | 0 回合 |
| 步枪命中敌身体 | 18 / 0 `shoot(yaw=0,pitch=-0.1861)` | 19 / 19000 | `actor`，hit=enemy，part=body，28 伤害，killed=false；终点 (0.007,0.896,4.72) | 16.667 | 1.347 / 0.744 | body | rifle 22 | enemy 72 | 0 回合 |
| 步枪命中友军 | 24 / 0 `shoot(yaw=1.8623,pitch=-0.2974)` | 25 / 25000 | `actor`，hit=ally，part=body，28 伤害，killed=false；终点 (2.234,0.933,0.089) | 16.667 | 1.425 / 0.744 | friendly | rifle 21 | ally 72，enemy 72 | 0 回合 |
| 步枪未命中 | 30 / 0 `shoot(yaw=0,pitch=1)` | 31 / 31000 | `range`，hit=null；终点 (0.151,86.755,53.209)，长 100 m | 16.667 | 1.445 / 0.744 | miss | rifle 20 | ally 72，enemy 72 | 0 回合 |
| 开始换弹 | 36 / 0 `reload` | 37 / 37000 | — | — | progress 0.009 / lower 0.007 | — | rifle 20，reloadEnd 150000 | 不变 | 0 回合 |
| 换弹中射击 | 37 / 0 `shoot(...)` | 38 / 38000 | 无 Shot | — | kick 0.320 / lower 0.027 | — | rifle 20，reloadEnd 150000 | 不变 | 0 回合 |
| 切手枪（打断换弹） | 44 / 0 `switch pistol` | 45 / 45000 | — | — | 0 / 0 | — | pistol 10，reloadEnd null | 不变 | 0 回合 |
| 手枪命中敌身体 | 57 / 0 `shoot(yaw=0,pitch=-0.1861)` | 58 / 58000 | `actor`，hit=enemy，part=body，24 伤害，killed=false；终点 (0.005,0.868,4.72) | 16.667 | 1.051 / 0.744 | body | pistol 9 | enemy 48 | 0 回合 |
| 切回步枪 | 70 / 0 `switch rifle` | 71 / 71000 | — | — | 0 / 0 | — | rifle 20 | enemy 48 | 0 回合 |
| 步枪命中敌头（击杀） | 83 / 0 `shoot(yaw=0,pitch=0)` | 84 / 83000 | `actor`，hit=enemy，part=head，84 伤害，killed=true；终点 (0.002,1.624,4.78) | 0 | 0 / 0（已结算） | kill | rifle 19 | enemy 0 | 0 回合 |
| 回合结算 | — | 84 / 83000，phase over | result：attack / amber / elimination | 此刻事件：pistol body 433.333，kill 0 | — | — | — | enemy 0 | 1 回合：shots 6，hits 3，headHits 1；wins 1 |
| 下一回合 | `Game.nextRound()` | round 2，tick 84 / 84000 | — | `Feedback` 事件 0 | — | — | 出生点重置，shots 0 | — | 1 回合 |
| 零射击回合 | 180 × `step([])` | tick 264 / 264000，phase over | result：defend / blue / timeout | 无 Shot | — | — | shots 0 | — | 2 回合：shots 6，hits 3，headHits 1；wins 1，losses 1 |

### 命中口径

- `summary.shots`：玩家实际产生的 Shot 数。tick 37 的 `shoot` 命令通过 `Game.step` 的校验，但换弹闸门使其不产生 Shot，因此不计入；步枪 4 发（墙、敌身体、友军、对空）+ 手枪 1 发 + 击杀 1 发 = 6。
- `summary.hits`：`TrainingMatch` 按玩家 Shot 的 `hit` 找到 Actor，再按不同 team 计数；不直接检查 `impact.kind`。本带另断言 `hit` 与 `ShotImpact.kind` 一致。敌身体 28、手枪敌身体 24、敌头 84 共 3 发；友军身体虽为 `actor` 命中但同队，不计；墙命中为 `world`、对空为 `range`、均无 hit，不计。
- `summary.headHits`：上述 hits 中 `part === 'head'` 的数量 = 1。
- 击杀判定来自该 Shot 的 `impact.killed`。回合结算后敌人 HP 已为 0，重新观察旧身体 Shot 仍得到 `body`；友军 Shot 仍为 `friendly`；只有击杀 Shot 为 `kill`。没有用晚到 HP 或 HUD 文案反推命中。
- 同一 Shot 重复调用 `Feedback.update`、`TrainingMatch.observe`、`localShotResult` 不会增加事件或回合；结算快照重复 observe 后仍只有 1 条 round 记录。

## 30/60/120 Hz 显示取样

同一命令带分别按 30、60、120 Hz 的显示帧推进同一 60 Hz 模拟。测试在每次 `game.step` 后记录一次 `Feedback` / `weaponPose` 事实：30 Hz 每个显示帧通常推进并记录 2 个 tick，60 Hz 约 1 个，120 Hz 有些显示帧推进 0 个 tick；显示帧墙钟只传入 `Feedback.update`，并在结算后决定尾段的读取节奏。客户端 `View.render` 则是每显示帧读取一次。固定 tick 1–84 的事实逐项深比较相等：`stateHash`、Actor HP/位置/武器/弹药/换弹、Shot 列表与 `ShotImpact`、`localShotResult`、`weaponPose`、`Feedback` 事件键与年龄。三种取样都在显示时间 1400 ms 观察到结算；零射击回合没有命令，直接逐 tick 推进，三种取样也都在 tick 264 / 264000 超时，回合统计相同。

- 实时/暂停阶段的事件年龄 = `(state.time - shot.time) / SECOND * 1000`，与显示墙钟无关；暂停时把显示时钟从 1000 ms 推进到 9000 ms、状态不变，年龄完全相同。
- 结算后的尾段按既有 700 ms 策略：三种取样都在墙钟 2100 ms（结算 1400 ms + 700 ms）移除击杀事件；移除前最后一个显示样本分别为 30 Hz 2066.67 ms（667 ms）、60 Hz 2083.33 ms（683 ms）、120 Hz 2091.67 ms（692 ms）。移除后 `Feedback` 事件数为 0，敌人不再显示死亡表现。
- 结算后 `Feedback.reset()` + `Game.nextRound()`，round 2 的 `Feedback.update` 返回 0 个事件；round 2 `shots` 为空。旧事件不跨回合重放。

## 当前源缺口（未造假动作）

- `Command` 没有独立的 stop、pause、end-round、next-round 命令。停止用 `move(0,0)`；暂停是客户端停止推进模拟；终局由 `Game` 权威结算；下一回合是 `TrainingMatch.canAdvance` + `Game.nextRound()`。
- `shoot` 在换弹中被接受但不产生 Shot，也不取消换弹；当前唯一正式的换弹打断是 `switch`（清空 `reload`，保留已消耗弹匣）。没有单独的 reload-cancel 命令。
- 没有强制结束回合的命令。零射击回合只能由 `roundTicks` 超时结算；本时间线用规则内 timeout，不改写 result。
- 射线不区分友军：`Physics.traceDetailed` 会命中同队 Actor 并结算伤害，本带友军实际掉 28 HP。`TrainingMatch` 在统计口径上按 team 排除友军命中；`localShotResult` 返回 friendly，真实 HUD 已有“友军命中”文案。
- `Feedback` 只消费带 `impact` 的 Shot；旧快照没有 `impact` 时不补造落点。

## 尚未验证

- 未运行浏览器 / headless / GPU / 音频设备，未做人工实玩。枪感、听感、画面、连续动作节奏仍需同段真实游玩判断；CPU 时间线只证明跨层语义和统计口径。
- 未接入旧存档导入；本验证只使用当前 `Game` 生成的新命令带。
- 未对 30/60/120 Hz 的浏览器实际渲染帧率、输入延迟或掉帧做测量；取样模型只覆盖固定 tick 事实与表现时钟读取。

## 复现

```text
node --import tsx --test tests/offline-training-v1/feedback-timeline.test.ts
npm test
```
