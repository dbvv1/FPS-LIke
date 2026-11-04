# 小样来源与许可

本目录 4 个 GLB 来自 Kay Lousberg（KayKit）的 CC0 内容。它们只是动作/骨架核对样本，不是本仓运行资产，也不代表已经在游戏里采用。

## 文件

| 文件 | 字节 | SHA-256 | 直接来源 | 许可 |
|---|---:|---|---|---|
| `Knight.glb` | 3,659,532 | `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168` | [KayKit-Character-Pack-Adventures-1.0 / Characters/gltf/Knight.glb](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb) | CC0 1.0，见 `LICENSE-KayKit-Adventurers.txt` |
| `Med_CombatRanged.glb` | 637,760 | `08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d` | [sketchpunklabs/kaykit_char / res/anim/Med_CombatRanged.glb](https://github.com/sketchpunklabs/kaykit_char) | CC0 1.0，见 `LICENSE-CC0-1.0.txt` |
| `Med_MovementAdvanced.glb` | 331,200 | `5d309533953185acc19800ce8d89c13cba8a68986214cb87520496139cf418e2` | 同上 | 同上 |
| `Med_General.glb` | 460,024 | `628e5fa41d82787f2d779320b49946c318dd8564ec2611b2a1bba1c0f33a6819` | 同上 | 同上 |

## 作者与许可覆盖

- 作者：Kay Lousberg，<https://kaylousberg.com>，<https://kaylousberg.itch.io>。
- 作者包页：<https://kaylousberg.com/game-assets/character-animations>、<https://kaylousberg.com/game-assets/characters-adventurers>、<https://kaylousberg.com/game-assets/characters-skeletons>。
- 官方 GitHub：<https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>。
- 许可：**CC0 1.0 Universal**。官方 README 写明 “Free for personal and commercial use, no attribution required. (CC0 Licensed)”；官方 `LICENSE.txt` 写明 “This content is free to use in personal, educational and commercial projects”。
- CC0 覆盖角色模型、贴图、骨架与动画；允许修改、商用与随作品再分发，不要求署名。本仓保留作者与包名仅作来源记录。

## 已知边界

- `Knight.glb` 是 Adventurers 包中的完整角色，含 15 个 mesh、1 张图集、41 关节、76 个 clip；**不含 crouch**，也不含枪/弹匣 mesh。
- `Med_*.glb` 是 sketchpunklabs 从 KayKit Character Animations 的 FBX 重导出的**纯动画 GLB**（0 mesh、23 关节），用于补 `Crouching`、`Running_HoldingRifle` 等 Adventurers 包没有的 clip；它不是 itch 原包的逐字节副本。
- `Med_*.glb` 的再导出仓库 `LICENSE` 是 CC0 1.0；原动作来源仍是 KayKit Character Animations（作者页同标 CC0）。
- 本卡没有从 itch 原页取得官方 zip，因此 KayKit Character Animations 免费档的完整成员、版本号与文件清单仍是未验证项。
- 这些文件没有经过 Three `GLTFLoader` 加载；只用 Python 读了 GLB JSON chunk。详见根目录 `CPU-PARSE.md`。
