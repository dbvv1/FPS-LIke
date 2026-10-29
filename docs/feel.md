# 手感规格与 CPU 基线

基线源 `83e7c0b4e2c026ded1906aa5be71601859482431`，Node 24.22.1，60 Hz；2026-10-29 实测。默认、movement-v2 和 offline-training-v1 分开计，不将旁置的运动模型写成 v15 训练赛已有能力。

## ground-v1 旁置训练赛：运动模型与渲染插值

入口：在原训练赛参数后加 `&feel=ground-v1`，例如 `/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&feel=ground-v1`。默认、原训练赛和 movement-v2 不变；本项是离线候选，未获屏幕帧、人感或标杆录像验收。

同一 `tools/measure-feel.ts` 输入脚本加 `--ground`，真实 Game 重放；旧三路 2700 tick 输出与原 baseline 逐字段一致。完整候选日志：[ground-v1.json](quality/feel/ground-v1.json)。

| 同脚本项目 | 原训练赛 | ground-v1 实测 |
|---|---|---|
| 前进1秒后的速度 | 4.497695 世界单位/s | 4.500845 世界单位/s |
| 松键后滑停采样端点／距离 | ≤16.67ms／0 | 350ms／0.612458 世界单位 |
| 反向首次前向速度非正／前移距离 | ≤16.67ms，直接倒退 | 116.67ms／0.202625 世界单位 |
| 起步首次≥4.49单位/s | 16.67ms | 566.67ms |
| 连射间隔／换弹 | 100ms／1.900s | 100ms／1.900s |

先按 `max(speed, stopspeed) × friction × dt` 减速，再沿期望方向补 `acceleration × wishspeed × dt`，上限为期望速度差。采用 friction=5.2、stopspeed=2.032世界单位/s、acceleration=5.5；保留4.5跑速及地图尺度。本作调校起点，未在CS2控制台核验，不能冒认当前CS2参数或品质达标。滑停350ms相比社区约400ms起点−12.5%；实际标杆同脚本录像仍缺，起步偏慢仍需非作者手感核验。

三种子（1–3）真实九机器人各完成六回合，逐个双次回放相等，未发现无视线射击；[完整比赛CPU记录](quality/feel/ground-v1-matches.json)，玩家席位保持idle。

碰撞后的真实位移回写速度，避免在墙内积累隐藏速度；玩家与九机器人共享模型。移动不准度改为真实速度占跑速比，≤34%不增加移动散布；滑行时禁止装拆包，停稳后才能开始，旧匀速路径保持原规则。

训练赛固定60Hz模拟；渲染只在该候选用 previous/current 位置及对手yaw按剩余tick比例插值。HUD、声音、射击和命中仍读当前模拟，玩家鼠标yaw/pitch每次渲染直接读Controls，不插值鼠标视角。重开/换回合/暂停恢复清历史；死亡/跨回合/大位移不跨状态混合。插值增加最多1个模拟tick的呈现滞后，是该常见方案的取舍，不称为输入延迟消失。CPU测试只证明采样连续和模拟不受render频率影响，真实144Hz屏幕和音画同步待测。

## 实测方法

`node --import tsx tools/measure-feel.ts docs/quality/feel/baseline.json` 经真实 `Game.create/step` 重放，不复制运动方程或改状态。固定 seed 1、合法出生点、两个无 bot 命令的角色，前进 60 tick 后松键／反向，另一路每 tick 请求射击 60 tick、停火、tick 150 换弹；各记录 300 tick；额外独立重放在末发后300ms/316.67ms请求第11发，读取真实图案计数与射击事件。射击由真实冷却拒绝多余请求，得到十发。位置差分测速度，单位为世界单位/秒；实测日志包括命令、位置、速度、视角、动作、实际射击及声音事件。声音事件不是可听音频。源码哈希与完整逐 tick 数据见 [baseline.json](quality/feel/baseline.json)；测试双次逐字段相等。

停步时间指松键后首次位移速度 <0.001 的采样端点，精度 1 tick；默认实际在命令时刻切零，不能把 16.67ms 采样端点称作硬件输入延迟。反向时间指首次前向速度非正，不是精确零交叉。4 秒后撞墙不影响前 1 秒/制动窗口。

| 项 | 标杆／来源及单位 | 本作规格（源码） | 本轮真实实测：默认 / movement-v2 / 训练赛 | 取值与差距 |
|---|---|---|---|---|
| 步枪跑速 | CS2 AK 215 u/s ×0.0254≈5.461 m/s；M4 225≈5.715 | 三路径 4.5 世界单位/s | 4.49770 / 4.50000 / 4.49770 | 暂按 1 世界单位≈1m 比较，较AK −17.6%、M4 −21.3%；地图尺度未作物理标定，不据此达标 |
| 松键滑停 | 社区约0.4s；friction 5.2、stopspeed 80、accel 5.5，均待游戏内核验 | 默认/训练赛匀速开关；v2 常量制动18单位/s²，不是Source摩擦模型 | ≤16.67ms、0距离 / 266.67ms、0.5625 / ≤16.67ms、0距离 | v2比社区起点短33.3%；原调参未经非作者确认，不能放宽±20% |
| 反向急停 | CS2同动作录像待测 | v2 reverseBrake55 | ≤16.67ms直接倒退 / 100ms首次非正、前移0.17748 / 同默认 | v2自然急停快于松键；非标杆等价证明 |
| 起步加速 | CS2待同输入录像 | 默认瞬时；v2 accel40 | 首次位移速度≥4.49：16.67ms / 133.33ms / 16.67ms | 不用源码常数代替验收 |
| 移动精度阈值 | CS2社区约最高速34%，AK≈73u/s≈1.854m/s，待核 | 默认看输入开关；v2按速度连续增散布，没有34%精准平台 | v2真实状态调用同一shootingState记录散布；默认/训练赛未暴露散布，null（另以300/316.67ms追加发探测图案重置） | 散布字段是模拟计算，不是屏幕弹着分布；需固定种子批量采样/录像 |
| 十发间隔／前后摇 | CS2具体枪型版本实测待补 | rifle interval6tick，无独立前摇 | 三路径10发，时刻0…0.9s，9间隔均100ms，首发命令时刻0 | 600RPM为本作测量，不冒认CS2枪型；可见枪口/镜头首帧待测 |
| 停火恢复 | CS2录像待补 | 默认超过0.3s后下一发重置图案；v2连续恢复 | v2最后一发后883.33ms recoilIndex归零；默认/训练赛追加探针：末发后300ms仍为第11发图案，316.67ms重置为首发图案 | 不将计数器不变误认未恢复；视角弹簧/屏幕散布待测 |
| 换弹／打断／切枪 | CS2分段动作及打断录像待补 | 步枪114tick，切枪12tick | 三路径实际开始到弹药补足均1.900s；本fixture未量打断与切枪 | 分段动作接触、音画同步待逐帧核 |
| FOV／眼高／鼠标倍率 | 同cm/360°对照待硬件DPI/录像 | 80°竖直FOV、站眼高1.62；1×倍率 | 本轮只核源码，未测屏幕投影/cm/360° | 不把配置写为实测 |
| 输入到屏幕／三路同帧 | 下一渲染帧；起停/射击/命中/击杀/碰撞的画面＋声音＋镜头 | CPU不可验证 | 全部待测 | 无渲染帧、音轨、标杆录像、非作者对照或人感分数 |

数值来源为 a1dbv `f4b4e801` 的 game-quality-pass/references/feel.md §6，链接：[CS2移动社区汇总](https://csdb.gg/guides/movement-guide/)、[急停社区说明](https://turbosmurfs.gg/article/how-to-counter-strafe-in-cs2)。本轮未游戏内核验，不将社区默认数值作为已确认CS2当前行为。Source运动模型的一手实现：[Valve SDK Friction/Accelerate](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/gamemovement.cpp)。这不是CS2当前闭源实现的证明。原始参数为本作旧原创调参，尚无可使超差获豁免的非作者依据。

## 管线核查（源码证据，不是延迟测量）

- `src/input/controls.ts` mousemove直接更新yaw/pitch，带视角的shoot命令排队；请求 `unadjustedMovement:true`，仅相应不支持错误回退普通Pointer Lock。实际设备raw input可用性未测。
- `src/client.ts` 每帧 `view.render(... controls.yaw, controls.pitch ...)`，鼠标视角不等逻辑tick。固定60Hz循环，滞后超过250ms暂停而非跳输入；按下/松开时间线由Controls消费，非setInterval射击。
- 默认、movement-v2、offline-training-v1客户端都是直接渲染当前state；未保留previous/current快照和alpha位置插值。模拟固定不等于144Hz平滑。**上述为原基线；ground-v1 旁置现已接入位置插值与摩擦运动，未开启该参数的旧入口保持基线。**
- v2模型有加速度、松键制动和反向制动，不是Source的stopspeed摩擦公式。默认/训练赛移动不准度看输入，不看真实速度。既有换弹动作分段不等于已验证接触和同帧反馈。

当前结论：尚未手感达标，也不能写“实测达标、未经人感”。CPU模拟实测、源码审核、屏幕帧测量和人感四类证据分开。
