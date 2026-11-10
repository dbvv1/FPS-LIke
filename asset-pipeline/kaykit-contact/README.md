# 固定 KayKit 源：动作存在，不等于枪手接触存在

目标是判断现有原生瞄准／开火／换弹是否已经有可测的枪、手和弹匣关系，而不是再做动作清单。输入固定在父候选 `9a5e7d814895bf20b0583c2f65c3de588a708790` 所用的 Knight 与 Med_CombatRanged；完整 SHA256 随工具与结果保存。源资产及许可沿原样本说明，不新增下载。

## 本轮决定

**缺独立物件需选择配套物件。** Knight 的 15 个网格节点是三把剑、四面盾、头盔、披风及六个蒙皮身体部件；固定运动文件没有网格。该分类来自对完整节点／父子关系和网格清单的检查；不是通用名称识别器，也不是逐三角的视觉物件识别。未识别出步枪或独立弹匣，所以没有可报告的手到枪／弹匣距离，结果明确为 `null`，不是 `0`。

`hand.l/r` 与 `handslot.l/r` 的完整世界位置已在三个原生 clip 各五个相位采样。它们能为随后配套物件挂接提供起点，却不能证明掌心接触、握持方向、穿插、双手约束或弹匣装卸。本轮不新增 IK，不改变角色、骨架、动作源或游戏入口。

下一步在既有已授权来源中选择有独立弹匣的步枪，并定明枪握把与弹匣的挂点。先确定配套几何，再看真实场景下的瞄准、射击与换弹全过程；不能把当前剑盾直接当作步枪接触代理，也不能用一个骨点到 AABB 的距离宣称握持正确。

## 可直接复跑

准备**已取得**的固定样本目录，其中只有命令所需的 `Knight.glb` 与 `Med_CombatRanged.glb` 文件名是约定。工具只读，不联网；缺文件、哈希错误、缺关键节点／clip均失败退出，不以空结果成功。

```sh
node --import tsx tools/check-kaykit-contact.ts "$FIXED_KAYKIT_SAMPLE" > contact-first.json
node --import tsx tools/check-kaykit-contact.ts "$FIXED_KAYKIT_SAMPLE" > contact-second.json
cmp contact-first.json contact-second.json
node --import tsx --test tests/kaykit-contact.test.ts
npm run typecheck
```

`result.json` 是这两个固定输入的 CPU 输出，不含输入路径或时钟。glTF 2.0 标准用米；作者的实际建模比例未独立核验。读取 Three.js 载入结果时保留原始 GLB 名与载入后名字的映射：如 `hand.l` 被加载器规范化为 `handl`，不能因字符串不相等就断言源没有手骨。

**失败反例**：只看 `2H_Ranged_Reload` 的名字就报“枪与弹匣接触通过”。这个文件确有动作，实际网格却无已识别枪／弹匣；工具因此不给接触距离。本轮还实见初版只按原名查 Three 对象时失败，改为明确使用载入器保留的原名映射，而非吞掉缺节点错误。

## 已运行与未运行

2026-11-10：Node 24.22.1，专项 3/3、typecheck 退出 0；真实两个 GLB 的 15 个姿态样本重复输出逐字一致。JSON保留完整节点、mesh／material引用、skin和clip库存，便于复核分类。纹理解码被 CPU 空纹理替代，未渲染、未看实际接触、未跑浏览器或 GPU，不提高品质分和内容覆盖，不代表完整游戏动作或已发布。
