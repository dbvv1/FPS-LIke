# 从现有角色原生动作补齐小范围射击链

## 目标

不等待另一个“完整免费包”，先消费已经固定并解析过的 Knight 自带双手瞄准、单次开火、换弹。保留现有跨骨架两类 reload 调用与默认角色。此页是可执行候选，不是画面验收或完整战术角色供给结论。

## 做法

使用固定 KayKit 样本的 Knight GLB（SHA-256 `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`）。把同次 GLTFLoader 解析得到的 `target.animations` 作为可选 `nativeAnimations` 传给 `KayKitSkinnedCharacter`；省略则仍仅加载原先两类 reload。显式传入后缺任何指定原生 clip 都失败回退，不悄悄播放半套。

```ts
const actor = new KayKitSkinnedCharacter({
  character: target.scene, motion: ranged.scene, animations: ranged.animations,
  nativeAnimations: target.animations,
});
actor.sample('native-aim-two-hand', 0.5);
actor.sample('native-fire-two-hand', 0.25);
actor.sample('native-reload-two-hand', 0.75);
actor.stop();
actor.dispose();
```

源内名称分别为 `2H_Ranged_Aiming`、`2H_Ranged_Shoot`、`2H_Ranged_Reload`，无需父节点重命名。消费器不鉴别文件来源，同 GLB 保证来自固定 hash 加载契约；验证唯一直接变换绑定、有限轨道与时长，复制 clip，不修改原始曲线或共享资源。`sample` 的相位由调用者负责；现有 Game 快照适配器仍只负责旧 reload，未新增开火事件映射。硬切换，不冒充过渡已做好。

## 一个失败反例

把“另一个官方免费动画包的 CombatRanged 清单未取回”推导成“当前 Knight 没有可用开火/换弹”会误停制作。固定 Knight 的 76 条 clip 已包含上述三条。反过来，有这三条也不能宣布完整供给：实际文件只有手部挂点，未提供枪/弹匣/手指节点；角色还带剑盾，需要后续实际观看、装备处理及接触核验，不能新建 IK 掩盖缺口。

## 可直接运行

```sh
npm run check:kaykit -- <fixed-sample-directory>
npm test
npm run build
```

真实固定 GLB 的 CPU 检查：三条原生动作 274 次采样（60 Hz、倒回、末帧、重启），全部节点世界矩阵对独立源 mixer 最大误差 0，1,018,184 次蒙皮顶点包围盒/球检查通过；旧跨骨架检查仍通过。测试 443/443，构建退出 0。纹理未解码、无浏览器或硬件 GPU 出图，未接 View，默认未变，内容覆盖仍 0/77。当前决定为继续补验：dot-B 负责源内动作/后续事件消费；真实装备接触、视觉过渡与完整 smoke 在实际出图链恢复后验，不把本 CPU 结论写成品质得分。
