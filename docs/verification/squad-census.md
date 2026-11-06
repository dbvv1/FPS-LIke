# 整场机器人职责普查（8 种子 × 6 回合）

任务：`B-FPS-SQUAD-MATCH-CENSUS-20261106`。日期：2026-11-06。

状态：CPU 模拟证据完成；本文件不构成攻守平衡、难度、手感或真人体验结论。未运行浏览器、GPU、音频或桌面。

## 范围与口径

- 复用 `tools/offline-training-v1/squads-sim.ts` 的 `runSquadMatch`，只增加可选第三参数 `observe?: (record: { round; tick; commands: Command[]; state: GameState; stateHash: string }) => void`，没有复制 controller 或整场循环。
- 玩家槽保持 idle，难度 normal，默认运动（未加 `--ground`），固定步长 60Hz；规则和参数未改；每个 seed 跑完整六回合。
- seed：1、7、19、31、73、127、257、509。
- 既有整场证据是 `docs/candidate-integration.md` 记录的连续 seed 1–5（`npm run sim:offline-training -- --seed 1 --seeds 5 --replay`），只有 seed 1 与本矩阵重叠，没有逐 tick 命令记录，也没有逐回合携弹/目标事实。仓库另有 `tests/offline-training-v1/squads-replay.test.ts`：它只录制 seed 1 首回合，在新建的 Game 中重放该回合并比较末 `stateHash`/state；`runSquadMatch` 返回的 `rounds[].finalActors[].planFromFreshStage0` 是回合结束时从新生 stage0 重算的 `squadPlan` 计划，不是实际控制职责。任务点名要先读的 `tests/offline-training-v1/squad-objectives.test.ts` 与 `squad-handoff.test.ts` 当前都通过：它们用真实 Bot 命令在受控短局验证了地面拾取、安放和拆弹都能发生，说明安放路径本身可用；本矩阵的 0 安放是完整六回合对局结果。本单元新增的是 8 seed × 6 回合、按 round 边界调用原 `nextRound` 的逐 tick `stateHash` 重放，以及逐回合携弹/目标事实和逐 tick 角色复算，不是单纯增加 seed 数，也不复制原驱动，也不重复这两个受控短局测试。
- observer 在每次 `step` 后调用，`round`/`tick` 取该步之后的当前状态；`commands` 为本步实际提交的命令，`state` 为深副本，`stateHash` 为原哈希。命令与状态都是克隆，observer 改写它们不会进入运行中的对局（测试会主动改写并核对）。
- 未传 observer 时返回值和 CLI 输出保持不变；测试对比了传与不传的完整返回值。
- “空转”只作诊断：目标任务进行中且连续 600 tick 无距离改善/任务进展；不当作自动质量失败，也不自动改路径。
- 该工具的入口守卫原先用 `process.argv[1]?.endsWith('/squads-sim.ts')`，在 Windows 上 `argv[1]` 是反斜杠绝对路径，守卫恒假，`npm run sim:offline-training` 会空跑。本单元改为仓库已有的 `import.meta.url === pathToFileURL(process.argv[1]).href` 判断；POSIX 行为与返回数据不变。

## 重跑

```sh
node --import tsx --test tests/offline-training-v1/squad-census.test.ts
npm run sim:offline-training -- --seed 1 --seeds 1 --replay
```

测试通过时会为每个 seed 打印一行紧凑 summary：

```text
census seed=1 rounds=6 steps=3038 reasons=elimination:6 tape=<SHA-256> drops=6 pickups=3 sameStepTakeovers=1 heldInteract=0 kills=53 teamKills=36 roleChanges=24 recoverAssignments=6 recoverTicks=641 defuseTicks=0 coverTicks=0 carrierStallMax=122 dropStallMax=364
```

测试断言：`complete`、observer 调用次数等于记录数且记录数等于六回合 ticks 之和、round 为 1–6、逐 tick `stateHash` 与最终 hash 重放一致，并逐 seed 断言 summary 的全部字段（steps、tape SHA-256、可观测掉落/地面拾取/同 tick 接替、`interact held`、击杀/同队击杀、角色复算和两项停滞最大值）。逐回合表的胜方、胜因、存活人数、首杀/玩家阵亡 tick 等仍是本次报告值，测试没有逐项断言；它们可由同一 observer 记录复算。summary 的 `drops` 只统计可观测无携弹 tick；`sameStepTakeovers` 是原携弹者阵亡同 tick 被 1 m 内队友接替的次数（本 sim 没有主动转交命令）。

单 seed CLI 按连续区间取 `--seed/--seeds`，`--replay` 只是同参数重跑比对；本普查的八个固定 seed 由测试逐个录制并重放，不依赖 CLI。

## 环境

- Node v22.23.2（`package.json` 的 engines 为 >=24，未满足；本次只跑 CPU 模拟，不涉及浏览器、GPU 或渲染）。
- tsx 4.23.15、TypeScript 7.0.2；依赖来自与 `package-lock.json`（SHA-256 `390c5619c464e5b164be3bf472bb41d0bfd3cc63d0309e21909026addf7f5e3c`）匹配的既有安装，未执行安装命令。
- Windows 11，Git Bash；所有运行均为无画面 CPU 模拟。

## 结论摘要

- 8/8 个 seed 完整六回合，48/48 回合正常结束；无 stall、无运行异常。
- 胜因：elimination 48、timeout 0、explosion 0、defuse 0。
- 安放 0 次、拆弹开始 0 次；17477 个 step 中 `interact` 且 `held=true` 的目标命令 0 条。
- 真实携弹 owner 变更：携弹权获得 24 次。其中可观测地面拾取 13 次（掉落与拾取之间至少隔一个可观测 tick）；另 11 次是原携弹者阵亡当步由 1 m 内队友自动拾起（同 tick 接替，不是主动转交）。可观测无携弹 tick 的掉落记录 47 次，加上同 tick 接替的 11 次，真实携弹者阵亡共 58 次；没有一次携弹者到达安放点并完成安放。
- 击杀 405 次，其中同队击杀 282 次（按 killing shot 的 actor/victim 队伍计数，只记事实）。idle 玩家在 22/48 回合被击杀。
- 职责复算：用 observer 的 state 为存活 bot 调现有 `squadPlan`，全矩阵 182 次角色变化、47 次 recover 指派（与 47 次可观测掉落同数），recover tick 合计 4222，defuse/cover 0（从未安放）。13 次可观测地面拾取全部由当时被指派为 recover 的 bot 完成（13/13），补位能转化为拾取；但这 13 次所在回合都以进攻方歼灭获胜、拾取者存活到回合结束并仍携弹。逐 tick 复算：13 次拾取时携弹者距 `MAP.site` 均为 18.84 m，拾取后同一携弹者继续接近，约 290 tick 后到达最近 6.73 m（siteRadius=2）并保持到回合结束，即实际推进约 12.1 m；但从未进入 siteRadius=2 的安放范围，也未发起安放。最终 0 安放，缺口在携弹后的最后接近/安放触发，不是没有推进，也不是补位或拾取失效。
- 8/8 个 seed 的已提交命令在新建 Game 中禁用 controller 重放，按记录 round 边界调用原 `nextRound`，逐 tick `stateHash` 相同；合计 17477 步。
- 600 tick 空转诊断 0 条。最长携弹无进展 122 tick；最长掉包未拾取 569 tick（seed 509 第 3 回合，低于 600 阈值）；没有安放，拆弹分支不适用。
- 首错：无。没有真实的逐 tick hash 反例，因此不保留完整命令带；每个正常 seed 只保留摘要与 tape SHA-256。

## 逐 seed 摘要

| seed | score amber:blue | steps | tape SHA-256 | replay | final hash |
|---:|---|---:|---|---|---|
| 1 | 1:5 | 3038 | `9850291633588eb89a9c34d3ef4a74e16251a5941488432b3907ed29f9591985` | 3038/3038 tick hash 相同 | `2ab0cc7e` |
| 7 | 5:1 | 1783 | `b49904c1d36411533e722caee06a45fbe222833efb756d2c0b834354ce7b2fb5` | 1783/1783 tick hash 相同 | `cba3eeda` |
| 19 | 3:3 | 2265 | `9b86707e3bb10d871725801076a415e99e5452e5af8e4c09843e917e78fdc85d` | 2265/2265 tick hash 相同 | `808f9508` |
| 31 | 4:2 | 2023 | `2b29a73e287185d34c5e05bdaafde3f27b712b72b2034256ccedaf30a3131bcd` | 2023/2023 tick hash 相同 | `970bc5f4` |
| 73 | 2:4 | 2562 | `d017449371b27f35c66cfa1a93b607942d4bd4848458017840bc90e7607fd132` | 2562/2562 tick hash 相同 | `e7985a82` |
| 127 | 4:2 | 1869 | `8f0cb9cb65958005de6507841940ef462400c85c611f05e544c881b81732d8e9` | 1869/1869 tick hash 相同 | `845b97c2` |
| 257 | 4:2 | 1673 | `0c9a143e94a44853e6edf36d786d59ecc8724c586750eb299d81fa32d5e116d6` | 1673/1673 tick hash 相同 | `b2edd6e5` |
| 509 | 3:3 | 2264 | `717b7f66d49867a4c5cdbe8904d27f0c2e238070e4cb9e08e70b5e39cc63119b` | 2264/2264 tick hash 相同 | `9fb1c11f` |

`steps` 是整场记录的 step 数，等于六回合 `ticks` 之和；tape SHA-256 对 `records.map(r => r.commands)` 的 JSON 计算。

## 逐回合事实

列说明：`tick` 为全局 tick（回合开始–结束）；存活为回合结束时 `amber:blue`，括号内为 `攻:防`；携弹变更为真实 `bomb.carrier` 变化，`∅` 表示无携弹者；安放/拆弹只记真实 `interaction` 或完成事件；目标命令只统计 `interact` 且 `held=true`；同队击杀只从 killing shot 的队伍关系计数。`携弹停滞/掉包停滞` 是该回合两条诊断的最长连续 tick：携弹停滞为该携弹者本次接手（含开局、原携弹者阵亡同 tick 接替、地面拾取）后，到 `MAP.site` 的平面距离相对“本次接手后的最小距离”未减少超过 0.05 的最长连续 tick 数，每次换人重置基准；掉包停滞为掉落当 tick 之后到下次有人携弹或回合结束之间无携弹的连续 tick 数（不含掉落当 tick）。表中两列都取该回合最大值。存活 bot 的 `squadPlan.role` 另由 observer state 逐 tick 复算，逐 seed 汇总见“职责可观测性”，本表不混入角色列。

### seed 1

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 205（1–205） | amber/elimination | 2:0（2:0） | 111:amber-1→amber-4；145:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t52 / — | 19/60 |
| 2 | 进攻 | 504（206–709） | blue/elimination | 0:1（0:1） | 345:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（6） | t259 / t709 | 26/364 |
| 3 | 进攻 | 450（710–1159） | blue/elimination | 0:1（0:1） | 845:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（7） | t760 / t1159 | 22/314 |
| 4 | 防守 | 622（1160–1781） | blue/elimination | 0:1（1:0） | 1300:blue-1→∅(掉落)；1438:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（5） | t1214 / t1781 | 122/137 |
| 5 | 防守 | 640（1782–2421） | blue/elimination | 0:1（1:0） | 1919:blue-1→∅(掉落)；2086:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（7） | t1836 / t2421 | 122/166 |
| 6 | 防守 | 617（2422–3038） | blue/elimination | 0:1（1:0） | 2542:blue-1→∅(掉落)；2691:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t2475 / t3038 | 122/148 |

### seed 7

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 185（1–185） | amber/elimination | 2:0（2:0） | 137:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t51 / — | 23/48 |
| 2 | 进攻 | 215（186–400） | amber/elimination | 2:0（2:0） | 334:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t238 / — | 35/66 |
| 3 | 进攻 | 156（401–556） | amber/elimination | 2:0（2:0） | 544:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t453 / — | 30/12 |
| 4 | 防守 | 390（557–946） | amber/elimination | 2:0（0:2） | 691:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（3） | t612 / — | 21/255 |
| 5 | 防守 | 191（947–1137） | amber/elimination | 2:0（0:2） | 1091:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t997 / — | 31/46 |
| 6 | 防守 | 646（1138–1783） | blue/elimination | 0:1（1:0） | 1279:blue-1→∅(掉落)；1440:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（7） | t1188 / t1783 | 122/160 |

### seed 19

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 164（1–164） | amber/elimination | 2:0（2:0） | 134:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t52 / — | 20/30 |
| 2 | 进攻 | 494（165–658） | blue/elimination | 0:1（0:1） | 283:amber-1→amber-4；290:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（5） | t217 / t658 | 5/368 |
| 3 | 进攻 | 203（659–861） | amber/elimination | 2:0（2:0） | 771:amber-1→amber-4；795:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t709 / — | 11/66 |
| 4 | 防守 | 197（862–1058） | amber/elimination | 2:0（0:2） | 1007:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t917 / — | 32/51 |
| 5 | 防守 | 598（1059–1656） | blue/elimination | 0:1（1:0） | 1188:blue-1→∅(掉落)；1319:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t1114 / t1656 | 122/130 |
| 6 | 防守 | 609（1657–2265） | blue/elimination | 0:1（1:0） | 1818:blue-1→∅(掉落)；1931:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t1706 / t2265 | 122/112 |

### seed 31

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 158（1–158） | amber/elimination | 3:0（3:0） | 无 | 安放 无；拆弹 无 | 0 | 7（5） | t53 / — | 45/0 |
| 2 | 进攻 | 158（159–316） | amber/elimination | 2:0（2:0） | 264:amber-1→amber-4；280:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（4） | t210 / — | 1/36 |
| 3 | 进攻 | 193（317–509） | amber/elimination | 2:0（2:0） | 428:amber-1→amber-4；467:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t366 / — | 25/42 |
| 4 | 防守 | 657（510–1166） | blue/elimination | 0:1（1:0） | 647:blue-1→∅(掉落)；832:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（7） | t566 / t1166 | 122/184 |
| 5 | 防守 | 216（1167–1382） | amber/elimination | 2:0（0:2） | 1301:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t1220 / — | 21/81 |
| 6 | 防守 | 641（1383–2023） | blue/elimination | 0:1（1:0） | 1520:blue-1→∅(掉落)；1681:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t1433 / t2023 | 122/160 |

### seed 73

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 462（1–462） | blue/elimination | 0:1（0:1） | 122:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（6） | t52 / t462 | 8/340 |
| 2 | 进攻 | 474（463–936） | blue/elimination | 0:1（0:1） | 600:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（5） | t513 / t936 | 24/336 |
| 3 | 进攻 | 174（937–1110） | amber/elimination | 2:0（2:0） | 1080:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t985 / — | 30/30 |
| 4 | 防守 | 229（1111–1339） | amber/elimination | 2:0（0:2） | 1233:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t1162 / — | 9/106 |
| 5 | 防守 | 617（1340–1956） | blue/elimination | 0:1（1:0） | 1483:blue-1→∅(掉落)；1608:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t1392 / t1956 | 122/124 |
| 6 | 防守 | 606（1957–2562） | blue/elimination | 0:1（1:0） | 2095:blue-1→∅(掉落)；2226:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（7） | t2011 / t2562 | 122/130 |

### seed 127

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 396（1–396） | blue/elimination | 0:1（0:1） | 104:amber-1→amber-4；116:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（7） | t53 / t396 | 1/280 |
| 2 | 进攻 | 164（397–560） | amber/elimination | 2:0（2:0） | 542:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t447 / — | 32/18 |
| 3 | 进攻 | 193（561–753） | amber/elimination | 2:0（2:0） | 687:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t611 / — | 13/66 |
| 4 | 防守 | 195（754–948） | amber/elimination | 2:0（0:2） | 896:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t810 / — | 29/52 |
| 5 | 防守 | 671（949–1619） | blue/elimination | 0:1（1:0） | 1098:blue-1→∅(掉落)；1277:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t998 / t1619 | 122/178 |
| 6 | 防守 | 250（1620–1869） | amber/elimination | 2:0（0:2） | 1763:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t1672 / — | 30/106 |

### seed 257

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 184（1–184） | amber/elimination | 2:0（2:0） | 148:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（7） | t50 / — | 34/36 |
| 2 | 进攻 | 163（185–347） | amber/elimination | 2:0（2:0） | 287:amber-1→amber-4；311:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t237 / — | 1/36 |
| 3 | 进攻 | 256（348–603） | blue/elimination | 0:1（0:1） | 482:amber-1→amber-4；484:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（3） | t398 / t603 | 21/119 |
| 4 | 防守 | 197（604–800） | amber/elimination | 2:0（0:2） | 720:blue-1→blue-4；726:blue-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t653 / — | 3/74 |
| 5 | 防守 | 670（801–1470） | blue/elimination | 0:1（1:0） | 943:blue-1→∅(掉落)；1122:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t855 / t1470 | 122/178 |
| 6 | 防守 | 203（1471–1673） | amber/elimination | 2:0（0:2） | 1605:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t1521 / — | 21/68 |

### seed 509

| 回合 | 玩家侧 | 回合 tick（全局） | 胜方/胜因 | 存活 amber:blue（攻:防） | 真实携弹 owner 变更 | 安放/拆弹 | 目标命令(held) | 击杀（同队） | 首杀/玩家阵亡 | 携弹停滞/掉包停滞 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | 进攻 | 193（1–193） | amber/elimination | 2:0（2:0） | 145:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t52 / — | 31/48 |
| 2 | 进攻 | 383（194–576） | blue/elimination | 0:1（0:1） | 307:amber-1→amber-4；319:amber-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（6） | t244 / t576 | 1/257 |
| 3 | 进攻 | 729（577–1305） | blue/elimination | 0:1（0:1） | 736:amber-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 9（7） | t629 / t1305 | 46/569 |
| 4 | 防守 | 171（1306–1476） | amber/elimination | 2:0（0:2） | 1437:blue-1→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（6） | t1358 / — | 18/39 |
| 5 | 防守 | 167（1477–1643） | amber/elimination | 2:0（0:2） | 1591:blue-1→blue-4；1603:blue-4→∅(掉落) | 安放 无；拆弹 无 | 0 | 8（5） | t1531 / — | 1/40 |
| 6 | 防守 | 621（1644–2264） | blue/elimination | 0:1（1:0） | 1775:blue-1→∅(掉落)；1924:∅→blue-5 | 安放 无；拆弹 无 | 0 | 9（6） | t1699 / t2264 | 122/148 |

## 职责可观测性

- 可观测且本普查已记录：`GameState.bomb.carrier`、`bomb.planted`、`bomb.explodeAt`、`interaction.actorId/kind/since`、`result`、actors 的 `hp/position/side/team/bot`，以及 shots 的 `impact.killed` 与命中者。
- 角色可复算：`squadPlan(o, slot)` 是现有公开 API（`src/candidates/offline-training-v1/sim/squads.ts`），只读 `self.side`、`bomb.carrier/planted/position`、存活队友位置和 slot，不依赖隐藏的 `routeIndex`。用 observer 的 state 构造同形 `Observation`（`self` + `allies` + `bomb`）即可逐 tick 复算每名存活 bot 的 role 以及 recover/defuse 指派；`tests/offline-training-v1/squad-census.test.ts` 已这样做并断言汇总值。
- 不可观测：controller 内部状态、`goal`、`routeIndex`/路径进度、某个 bot 是否“知道”敌情。`planFromFreshStage0` 是回合结束后用新生 stage0 重算的 `squadPlan` 结果，不是该回合实际控制职责；本普查不拿它代替逐 tick 角色。
- 因此“安放/拆弹 owner 变更”只在真实 `interaction` 和完成事件存在时记录。本矩阵中从未发生，写“无”，不把“接近点位”当作职责。
- `interact` 且 `held=false` 的命令不是目标命令，未计入上表。

逐 seed 角色复算汇总（存活 bot；含回合结束那一 tick；角色变化按每个 bot 与其上一条存活记录比较：同一回合内相对上一 tick，跨回合沿用上一角色，仅整场首条记录无前值不计；若该 bot 上一回合末已阵亡，则与其最后一次存活 tick 的角色比较；回合 2–6 首 tick 因换边/位置重置会正常计入变化。recover 指派为进入 recover 的次数；表中 `tick` 按 bot 累加）：

| seed | 角色变化 | recover 指派 | recover tick | defuse tick | cover tick |
|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 6 | 641 | 0 | 0 |
| 7 | 20 | 6 | 591 | 0 | 0 |
| 19 | 24 | 6 | 474 | 0 | 0 |
| 31 | 22 | 5 | 507 | 0 | 0 |
| 73 | 21 | 6 | 502 | 0 | 0 |
| 127 | 22 | 6 | 486 | 0 | 0 |
| 257 | 25 | 6 | 416 | 0 | 0 |
| 509 | 24 | 6 | 605 | 0 | 0 |
| 合计 | 182 | 47 | 4222 | 0 | 0 |

表中 182 次角色变化包含 111 次发生在回合首 tick（各 seed 依次 14/13/14/13/13/14/15/15），其余 71 次发生在回合内（依次 10/7/10/9/8/8/10/9）。若按每回合重置角色基准复算，只得到这 71 次；本表采用跨回合沿用口径，与测试 `roleChanges` 的断言一致。

recover 指派数与 47 次可观测掉落同数，说明掉包后确有 bot 被计划去补位。13 次可观测地面拾取全部由当时被指派为 recover 的 bot 完成（13/13），补位确实能转化为拾取；但这 13 次所在回合都以进攻方歼灭获胜，拾取者存活到回合结束并仍携弹。13 次地面拾取时携弹者距 `MAP.site` 约 18.84 m，拾取后均接近到最近 6.73 m（各 seed 相同，约 290 tick 后），但未进入 siteRadius=2 的安放范围，最终 0 安放；缺口在携弹后的最后接近/安放触发，不是没有推进，也不是补位或拾取失效。47 次可观测掉落中另 34 次到回合结束无人拾取：其中 20 次所在回合以防守方歼灭进攻方结束，14 次进攻方仍以歼灭获胜但炸弹留在地上。11 次 A→B 是原携弹者阵亡同 tick 由 1 m 内队友拾起，不是主动转交；可观测掉落 47 加同 tick 接替 11，真实携弹者阵亡共 58 次。以上只是职责事实，不是质量结论。

## 空转诊断

诊断口径：

1. 携弹：bomb 未安放且存在真实携弹者，携弹者到 `MAP.site` 的平面距离连续 600 tick 没有改善（阈值 0.05）。
2. 掉包：bomb 未安放且无携弹者，连续 600 tick 没有拾取。
3. 拆弹：bomb 已安放且无拆弹 `interaction`，最近存活防守者到 bomb 的平面距离连续 600 tick 没有改善。

本节的 600 tick 阈值诊断与逐回合表的“携弹停滞/掉包停滞”使用同一距离/无携弹口径，但前者只在连续 600 tick 未改善时报警，后者记录每回合的最长连续值。

本矩阵 0 条达到 600 tick。接近阈值的观测：seed 509 第 3 回合掉包后 569 tick 未被拾取（回合在 t1305 结束，未跨过 600）；最长携弹无进展 122 tick。因为没有任何一条达到阈值，没有需要保留的最短命令前缀或首次异常前缀；也没有失败反例。若后续复现 600 tick 空转，按同一 observer 记录首次异常 tick 与最短命令前缀 SHA-256。

## 限制

- 8 个 seed 只描述本矩阵，不用于判断攻守平衡、难度优劣或真人体验。
- 玩家槽 idle 是原有 CPU 证据口径，不代表真人操作。
- 同队击杀、掉落/拾取和击杀数均为本矩阵的观察事实，不是质量结论。
- 未运行浏览器、GPU、音频或桌面验证；未修改 `src/`、规则、模型或默认输出。
