# FPS-Like

原创网页第一人称射击：单个爆破点、三条进攻路线、步枪与手枪，1v1 回合制攻防，对手是机器人。

**开发中的第一人称原型。** 在原创「中继场」与一名机器人交战；支持无画面批量模拟。

## 旁置试玩

[在线试玩](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/)。默认入口保留原来的 1v1 操作与规则。以下入口可单独打开，也可随时去掉参数返回默认版本：

- [角色与第一人称武器内容](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?contentSet=characters-v1)：采用成套角色、武器与动作资源，需要 WebGL2。
- [移动制动与连续射击](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=movement-v2)：加速、松键制动、反向急停和持续后坐力。
- [组合试玩](https://dbvv1-fps-like.pretty-llama-9945.chatgpt.site/?gameplay=movement-v2&contentSet=characters-v1)：同时开启以上两项。

## 本地试玩

需要 Node.js 24+、桌面键盘与鼠标。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，点击「进入靶场」锁定鼠标。支持 WebGL2 时使用 Three.js；否则使用标注为 `CPU / CANVAS2D` 的简化第一人称画面，两者共用同一份对局规则。

| 操作 | 按键 |
|---|---|
| 移动 / 看向 | WASD / 鼠标 |
| 射击 | 鼠标左键；步枪可按住连射 |
| 静步 / 蹲伏 | Shift / Ctrl |
| 换弹 / 切枪 | R / 1、2 |
| 安放 / 拆除 | 靠近目标，按住 E |
| 暂停 / 释放鼠标 | Esc |

进攻方安放信标或击倒对手，防守方守住时间或拆除信标。每三回合换边，比分保留；回合结束点击「下一回合」。暂停菜单可以重开，并选择下一场的机器人难度或关闭合成音效。展开「鼠标灵敏度」可调瞄准倍率，点击「保存并应用」后生效并记在此浏览器；「取消修改」保留原值，「恢复默认」再应用可回到原版 1.00×。

生产预览：`npm run build` 后运行 `npm run preview`。客户端的当前范围见 [客户端接入](docs/client.md)。

## 运行机器人对局

需要 Node.js 24+。

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
