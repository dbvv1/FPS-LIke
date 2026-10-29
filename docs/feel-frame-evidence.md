# 固定输入到录制帧：待实拍的最小接线

本候选在既有离线 5v5、真实 Game.step 与生产 View/HUD 里加独立入口：

`/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&feelCapture=move-stop`

原 qualityCapture 的三机位、idle 输入及冻结拍摄版本不改变。这里只固定正常玩家机位；与 qualityCapture 混用报错。前120 tick与原 idle 回放相同，从第121 tick起发正Z移动60 tick，然后发停止60 tick；其余九个机器人仍经正常命令入口。没有模拟状态注入、设备输入、玩法修改或新运动模型。

## 取证顺序

1. headless 接收端须按现有串行、sandbox与真实退出规则，另获准拍摄这个候选后才运行。本次未启动浏览器，也未发新本机卡。
2. 保存就绪时帧0 PNG和完整 `__shot`。随后每次只调用一次 `__shotNext()`，等待本次返回后保存对应整页PNG与完整返回JSON，直至帧120。固定1280×720/DPR1；同一轮独占目录。记录实际源/tree/build hash、浏览器版本、renderer原始信息、完整启动参数和退出。不能把原 idle 拍摄批次改成此入口。
3. `feel.observations` 的命令ID是 move-start／move-stop。输入分别进入在已渲染帧0／60之后，模拟前tick120／180，预期执行结果tick121／181。`acceptance`只证明本次正常step后的玩家移动轴与命令一致且玩家活着；不是全类型命令ACK，也不证明位移、碰撞通行、开枪或屏幕像素。
4. `feel.recordingFrame`与 `virtualPtsMs` 是固定60fps录制时间。`stage`只到render提交＋gl.finish；不是PNG已保存、浏览器合成已展示或显示器present。生成每帧 file、SHA256、frame、simulationTick、stage记录，离线调用 `tools/feel/verify-frames.ts` 的 verifyFrames。第四参数 TraceBundle 必须含同轮 runId、完整 sourceCommit、build 及121条完整 __shot 取证（FrameTrace.shot）；每条保留同一 runId/sourceCommit/build。校验命令出现帧、进入/接受tick、接受状态、命令内容和后续帧回执不变。没有trace或接受未观察到时，即使有PNG和人工标注也不产反馈帧数。必须有121张连续独立文件，不能跳帧、重复路径或拿tick号当录制帧。
5. 非作者逐帧查看画面并标注每条命令首个可见变化帧、说明、作者/判者身份。输入到反馈录制帧数=首可见帧−输入之前已完成帧。校验器绑定首可见帧PNG哈希，但不会凭文件hash变化宣称视觉变化，也无法代替判者证明首帧正确。命令导致的变化须与机器人/动画背景变化区分；必要时做同初始状态的idle对照。

录制脚本应逐帧确认JSON与文件关联；这个离线校验器不能证明来源真实性。没有标注时 visual为空且 pendingVisualCommands列出待判项。没有音轨，audio永久unknown；deviceLatencyMs为null。固定虚拟回放不测真实设备到屏幕延迟，亦不测rAF调度、丢真实展示帧或音画同帧。

## 本次验证与未完成

CPU测试真实初始化5v5并推进两份相同move-stop输入，哈希逐tick一致，验证两命令观察时点和生命周期。PNG校验测试使用明确合成的黑图，只测试序列/哈希/缺帧/非作者标注约束，不是实机图。本候选尚未浏览器smoke、未实拍、未盲判、未听音、未合入或部署；不能提升可玩客户端质量评级。

MOBA和Star尚未接入此接口：MOBA需保留30Hz模拟与独立60fps插值渲染，Star需保留120Hz模拟和追尾相机逐帧更新。两者不能照搬FPS的每录制帧一个tick；共用的只是命令ID、独立录制帧、源图哈希和非作者标注证据原则。

返工：首版负Z路线会撞后墙，不能用来量停止。已改为正Z并在最后移动tick强制检查位移至少0.05；测试验证停止前一帧约0.075单位，停止帧小于0.0001。旧87351b3包未通过独审，不得派发。
