# FPS-Like

原创网页第一人称射击原型：在「中继场」的三条路线间争夺一个信标点，使用步枪与手枪参加 **1 人＋9 机器人的六回合训练赛**。前三回合进攻，后三回合防守。

## 开始试玩

[在线进入训练赛](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/)。使用桌面键盘与鼠标，等待场景加载完成后点击「进入靶场」锁定鼠标。首页已包含庭院标准件与新灯光，移动使用原训练赛模型。

想先降低难度，在菜单选择「入门」，点击「重新开始」，再点击「进入靶场」。**只改难度选项不会改变当前比赛的机器人**，点击「下一回合」也不会应用新难度。

支持 WebGL2 时显示 3D 场景；否则使用标注为 `CPU / CANVAS2D` 的简化第一人称画面，两者共用同一份对局规则。

## 操作与获胜

| 操作 | 按键 |
|---|---|
| 移动 / 看向 | WASD / 鼠标 |
| 射击 | 鼠标左键；步枪可按住连射 |
| 静步 / 蹲伏 | Shift / Ctrl |
| 换弹 / 切枪 | R / 1、2 |
| 安放 / 拆除 | 在交互位置停稳，按住 E |
| 暂停 / 释放鼠标 | Esc |

- **进攻方**：歼灭全部防守者，或安放信标并守到引爆。只有携带者能在目标区安放，需要持续 3 秒；安放本身还不算获胜。
- **防守方**：信标未安放时，歼灭进攻方或守到回合超时；信标已安放后，靠近它停稳并按住 E，持续 5 秒完成拆除。此时即使敌人全部倒下，也必须拆除。
- **交互中断**：移动会清空安放／拆除进度；开枪、开始换弹或切到另一把枪后，需松开 E，再按住才能重新交互。换弹结束并完全停稳后再操作。

回合结束点击「下一回合」继续；第三回合后点击「交换攻守 · 第 4 回合」。第六回合结算后，点击「再打一场」返回部署菜单，再点「进入靶场」开始新赛。

## 暂停与设置

Esc 释放鼠标并暂停，点击「继续回合」返回当前对局；「重新开始」清空本场比分并应用当前难度。菜单可关闭合成音效。

展开「鼠标灵敏度」，调整后点击「保存并应用」，设置会记在此浏览器；「取消修改」保留原值，「恢复默认」再应用可回到 1.00×。

## 可选体验

- [加速度与摩擦手感](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&feel=ground-v1)：在当前训练赛中体验起步、滑停与反向变化。
- [全场 AI 材质](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&materials=ai-courtyard-full-v1)：WebGL2 下显示地面、庭院墙面、中心折墙与低掩体的新材质，可另加 `&feel=ground-v1` 组合手感。
- [旧版 1v1](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=legacy-v1)：返回单个机器人对抗。
- [旧版 1v1 角色与武器展示](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?contentSet=characters-v1)：使用成套角色与第一人称武器资源，需要 WebGL2。它属于旧版 1v1，不与六回合训练赛参数组合。

返回[无参数首页](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/)恢复当前默认训练赛。若只比较一项，保留链接中的其他参数，删除 `feel`、`materials`、`art` 或 `lighting` 可分别关闭手感候选、AI 材质、三件标准件或新灯光；不要只保留 `?feel=ground-v1`，它不能单独选择训练赛。旧 movement-v2 链接会返回当前默认训练赛。

画面差距与验证范围见[品质页](docs/quality.md)。

## 本地试玩

需要 Node.js 22.12+（本机接收端为 22.23.2）。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，按上面的试玩步骤进入。生产预览：`npm run build` 后运行 `npm run preview`。客户端当前范围见[客户端接入](docs/client.md)。

## 运行机器人对局

需要 Node.js 22.12+（本机接收端为 22.23.2）。

```sh
npm ci
npm run sim -- --games 200 --seed 1
```

输出攻守胜率、回合时长、两把武器的命中率／爆头率／击杀时间，以及机器人的反应时间和无视线开火次数。默认交替使用步枪与手枪，可用 `--weapon rifle` 或 `--weapon pistol` 分别比较。

```sh
npm run sim -- --games 250 --seed 1001 --attack hard --defend easy
```

难度可选 `easy`、`normal`、`hard`，只改变反应和瞄准，不改变伤害或血量。

设计目标见 [设计任务书](docs/brief.md)，规则接口与批量结果见 [模拟层接口](docs/simulation.md)。
