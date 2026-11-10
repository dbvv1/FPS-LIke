# KayKit 蒙皮角色消费者：独立生命周期候选

`src/render/kaykit-skinned-character.ts` 解决旧刚性消费者不能接 SkinnedMesh 的一个阻塞：为已经解析的 Knight 和动作源创建独立角色、骨架、mixer 与动作实例。它没有接入 `View`，不替换默认角色，不改变 `ContentSetAssets`／`ContentOpponent` 的刚性拒绝合同，也不装配枪或弹匣。

## 使用合同

- 输入是 GLTFLoader 已解析的 `character`、`motion` 和 `animations`。调用方负责来源校验、加载与原资源的释放；本模块不建立新的生产 URL 或自动下载路径。
- `new KayKitSkinnedCharacter(sources)` 严格验证并创建一个实例。`play('reload-one-hand')` 与 `play('reload-two-hand')` 映射原始 `Rig_Medium|Ranged_1H_Reload`／`Ranged_2H_Reload`。两种都只播一次并停在结尾；切换或重播立即重置，无混合、移动层或游戏事件绑定。未知动作返回 false，不打断当前动作。
- `update(deltaSeconds)` 只推进此实例，并刷新此实例各 SkinnedMesh 的当前姿态局部 AABB／sphere；构造、play、stop 也刷新。父容器移动后须在渲染前调用 update（可传 0），以刷新祖先世界矩阵及 skin bind 缓存。不写共享 geometry 的静态包围体，不更新兄弟实例或原素材。`stop()` 恢复克隆的初始局部姿态（含 scene 根节点）。角色在世界中的位置／朝向应放在额外的父容器上，不直接写入此 scene。`dispose()` 停止动作、uncache mixer、释放独立 skeleton palette 并从场景移除，可重复调用；之后不会继续播放。
- `KayKitCharacterSlot.load(loader)` 为异步边界提供 off→loading→ready/fallback。只有 ready 才能使用 `character`；缺输入、解析失败或合同不符都保持 null，让调用方继续显示已有回退。dispose 会中止 signal，晚到的成功／失败不会重新创建角色。loader 及其解析结果仍归调用方所有，须自行处理晚到结果的资源释放；slot 不销毁借入素材。
- 所有角色共享**只读 geometry、material、texture**。原素材必须存活到最后一个角色 dispose。骨骼、骨架调色板、inverse-bind 矩阵、动作轨道及 mixer 不共享。不要通过公开 scene 修改共享材质／几何；若需要逐角色换色，由上层显式克隆并承担其生命周期。

父轨道适配移植自 a1dbv `experiments/kaykit-rig-intake/remap.mjs`：唯一节点、直属 rig/root 层级、完整 transform 通道、相同骨层级、单位场景变换均通过后，仅把 `Rig_Medium` 改为 `Rig`，保留时间、数值与插值。不在源对象上调用矩阵更新；原始局部姿态、矩阵缓存与 clips 均不变。这不是通用重定向器。

## 为什么不用普通 clone

对照安装的 Three 0.186.1 实现：`SkinnedMesh.copy` 保留原 skeleton 引用，普通 `Object3D.clone(true)` 会让实例仍引用原骨架。官方 `SkeletonUtils.clone` 重新映射克隆骨骼并创建 skeleton，但 `Skeleton.clone` 仍复用 inverse-bind 数组。因此本模块采用官方工具，再克隆 inverse-bind 矩阵，避免实例操作影响源或另一个实例。共享网格资源减少重复内存，代价是调用方必须遵守只读与寿命合同。

依据：[SkeletonUtils](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/SkeletonUtils.js)、[SkinnedMesh](https://github.com/mrdoob/three.js/blob/r186/src/objects/SkinnedMesh.js)、[Skeleton](https://github.com/mrdoob/three.js/blob/r186/src/objects/Skeleton.js)；核对实际安装 0.186.1 源码，2026-11-10。

## 复验

```sh
npm ci
npm test
npm run build
npm run check:kaykit -- <fixed-sample-directory>
```

固定输入保持在 FPS-Like [78a892c 的小样目录](https://github.com/dbvv1/FPS-Like/tree/78a892c6cf057ddb63b4fc21daafdd7e4313453a/asset-pipeline/character-action-sources/sample/kaykit)，不复制进本候选。命令先校验 Knight 与 Med_CombatRanged 的 SHA-256；缺参数退出 2，缺文件／错误哈希失败，不能跳过后报成功。普通测试套件覆盖缺源、坏源、pending dispose 和 late resolve/reject，不依赖外部素材。

真实输入命令用 GLTFLoader、AnimationMixer、SkinnedMesh 跑两实例隔离、两种 reload 切换／重播、stop、dispose 与共享资源不被释放；另按 60 Hz（含端点）比较动作源和角色所有动画节点的世界矩阵，并对每片网格首／中／末顶点独立计算蒙皮参考。贴图用空 Texture 替代，未解码，不代表视觉验证。a1dbv 原适配器的全关键帧／全顶点检验仍是坐标合同的更广证据。

**未接收项**：idle→run→reload→death 完整动作组、过渡观感、纹理／GPU、GPU 中的可见性与性能、枪／弹匣接触、游戏事件同步与实玩。此候选仅移除独立蒙皮实例生命周期这一工程阻塞，不能算玩家可见改善或产品采用。

2026-11-10 实测：普通套件 438 项通过；生产构建通过。固定小样 173 帧、3,114 次顶点参考比较，世界矩阵最大差 0、蒙皮最大误差 1.12e-15；两个角色互不推进源／彼此骨架，6 个实例调色板各释放一次，共享素材释放次数为 0。无参数、缺文件、坏哈希均非成功退出。未开启浏览器或 WebGL。

2026-11-10 动态包围体增量：两种 reload 共 173 帧的全部 642,868 个蒙皮顶点落在实例 AABB／sphere 内；合成蒙皮角色的 CPU frustum 检查覆盖动作进入／离开视野、父容器移动、重播及 stop 恢复。共享 geometry、原素材和兄弟实例边界不变。每次 pose 更新对每个 skin 重新计算 box 和 sphere，各遍历一次全部顶点（合计两遍），成本随顶点数增长；尚无 GPU 实测或帧预算结论，不能宣称实际遮挡／视锥表现通过。
