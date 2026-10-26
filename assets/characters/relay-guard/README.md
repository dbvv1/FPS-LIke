# Relay Guard：一套源姿态，两个渲染后端

采用源候选为 Casti_131 的 [Low Poly Soldier with weapons](https://opengameart.org/content/low-poly-soldier-with-weapons)，作者本人于 2017-01-11 发布为 CC0；2026-10-26 取回原 ZIP、Blender 与配套贴图。当前只消费男角色和一把第三人称步枪，不引入新武器规则。

`guard.json` 是两个后端共用的运行几何与面颜色；`relay-guard.blend` 是清理路径后由所选姿态重建的可编辑派生网格，不是原 rig 原样保存。原完整 rig／动作仍可从作者 ZIP 取得。生成入口：

```sh
blender --background --factory-startup --disable-autoexec <原包>/soldier.blend --python tools/build-target.py
blender --background --factory-startup --disable-autoexec --python tools/build-target.py -- --editable
```

配方使用原帧 0、从原第一人称相机的实际前向求旋转、经原瞄准控制器水平正视、原面罩关闭；枪随原握持 socket 的变换移动。按头中心与脚底统一等比换算到米，头中心为 1.62m；不改命中体或拉伸骨骼。省去背部附件，采样原 UV 面颜色，布料由消费者换成阵营色。头盔与胸板的灰色面由 `src/render/target.ts` 共用材料配方聚合成浅砂色／阵营暖冷色，保留蓝面罩、深色布料、腰带及武器；不加发光或绕过遮挡。原始面色仍保留在可编辑派生源中。原步态尚未接入；行走、受击、倒下仍取当前游戏的表现规则。

原 ZIP SHA256：`2e96f96f77865009ad756b99b4212eb7fb6fe3faaed2a6e5372df052b12b7fdb`；原 `soldier.blend`：`dee84d920eba04121234e5d4b2d693f6148792b902d8cf23afedfa59e17a19c7`。实际下载：[作者 ZIP](https://opengameart.org/sites/default/files/low_poly_soldier.zip)。许可见 [LICENSE.txt](LICENSE.txt)，当前采用判断见 [quality](../../../docs/quality.md)。
