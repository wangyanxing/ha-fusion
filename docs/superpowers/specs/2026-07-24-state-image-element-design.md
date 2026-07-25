# State Image 元素设计（户型图光照 overlay）

日期：2026-07-24
状态：已确认，待实现

## 背景与目标

在 fork 的 ha-fusion 上实现一个户型图仪表盘：以户型图为底图，叠加各房间的"光照亮起"遮罩图（overlay PNG），实现"某个灯开着，对应房间就亮"的效果。

现状限制：ha-fusion 的 Picture Elements 编辑器中，普通 `image` 元素是静态的，状态订阅只处理 `state-icon` 和 `state-label`。因此原版能点击开灯，但无法根据灯的 on/off 自动显示/隐藏 overlay。

方案：新增一个最小的元素类型 `state-image`——一个绑定 Home Assistant 实体的图片元素，根据实体 on/off 状态淡入淡出显示/隐藏。

## 已确认的需求决策

- **显隐规则**：简单 on/off。`$states[entity_id].state === 'on'` 时显示，否则隐藏。
- **适用实体**：通用 on/off，不限 light（switch、input_boolean 等均可）。
- **过渡动画**：淡入淡出（~250ms opacity 补间）。
- **点击交互**：overlay 不接收点击（`listening: false` 恒定）。交互由独立的 `state-icon`（灯泡图标 + onclick 调 HA 服务）负责，不在本补丁范围内。
- **编辑器预览**：编辑时总是按配置的 opacity 满显示（忽略实时状态），与 state-icon 编辑器行为一致，方便定位摆放。

## 架构概述

ha-fusion 的 Picture Elements 基于 Konva.js，分两层：
- `KonvaViewer`（只读渲染，仪表盘正常显示）
- `KonvaEditor`（编辑器 modal）
- 二者共享 `KonvaBase`。

元素以 Konva 序列化 JSON 存于 dashboard item 的 `elements` 数组。类型由 `attrs.type` 字符串标识。没有集中式类型注册表——新增类型需同步改多处 switch/分支。

关键机制：状态订阅回调（viewer 与 editor 各有一份）通过 `node.getAttr('entity_id') && node.attrs.type.startsWith('state-')` 筛选需要响应状态的节点。由于 `state-image` 以 `state-` 开头，会自动进入该筛选，只需在回调内加一个分派分支。

## 数据结构

`state-image` 是一个 `Konva.Image`，序列化持久化字段：

| 字段 | 说明 |
|------|------|
| `id` | 唯一 id（`state-image-<ts>-<rand>`） |
| `type` | `'state-image'` |
| `name` | 图层名，默认 `'State Image'` |
| `x, y, width, height, scaleX, scaleY, rotation` | 变换 |
| `opacity` | 用户配置的"亮起时"目标透明度（默认 1） |
| `visible` | 恒 true（靠 opacity 控制显隐，不用 visible） |
| `listening` | 恒 false（不接收点击） |
| `entity_id` | 绑定实体 |
| `src` | overlay 图片 URL |

运行时字段（不持久化）：`image`（HTMLImageElement，序列化时删除）。

## 行为设计

### Viewer（仪表盘）
1. 加载图片：复用 `KonvaBase.updateImage(node, src, false)`。
2. 新增方法 `updateStateImage(node, $states)`：读取 `$states[entity_id]?.state`；用 `Konva.Tween` 将 opacity 补间到目标值（on → 配置 opacity，off → 0），时长约 250ms。补间前存储/读取配置目标 opacity（存于自定义属性 `targetOpacity`，或初始化时从持久化 opacity 读取）。
3. 初始 opacity 设为 0，首个状态推送到达时再淡入，避免加载闪烁。
4. `listening: false`，不绑定 click；`handleNodeClick` 对其跳过（因无 onclick，现有逻辑已 `listening(!!onclick)`，天然为 false）。
5. `handleMount` 现有逻辑会移除 `!isVisible()` 节点——state-image 恒 `visible: true`，不受影响。

注意：正在补间中若状态再次变化，需停止旧 tween 再启动新 tween，避免叠加。

### Editor（编辑器）
1. 编辑器忽略实时状态，始终以配置 opacity 满显示（便于定位）。即 editor 的 `subscribeStates` 对 state-image **不做** opacity 变更（跳过），只有 viewer 做。
2. 新增 `addStateImage()`：默认 src 用一张 demo 图或空，`type: 'state-image'`、`entity_id: ''`、`listening: false`、加载后 fitImage。
3. 表单字段（SelectedAttributes）：Entity（带 entityOptions 下拉）、Source、Width、Height、Opacity。

## 需改动文件清单

1. **icons.ts** — 加 `'state-image': 'mdi:lightbulb-on'`（或类似）。
2. **konvaBase.ts** — 新增 `updateStateImage()` 方法；`getShapeAttrs()` 加 `state-image` 分支导出 `entity_id`、`src`。
3. **konvaViewer.ts** — `handleMount()` 图片加载 switch 加 `state-image` case（loadImage + 初始 opacity 0）；`createNode()` 加 case；`updateNode()` 加分支；`subscribeStates()` 回调加 `state-image → updateStateImage` 分派。
4. **konvaEditor.ts** — 新增 `addStateImage()`；`localAddNode()` 的 image 组加入 `state-image`；`updateAttr()` 加 `state-image` 的 `entity_id` 处理（仅 setAttr，不改 opacity）；`subscribeStates()` 对 state-image 跳过 opacity 变更。
5. **Toolbar.svelte** — 加"Add New State Image"按钮。
6. **SelectedAttributes.svelte** — 加 `state-image` 表单分支（Entity/Source/Width/Height/Opacity）。
7. **ElementsPanel.svelte** — 图层缩略图：`state-image` 复用 image 的 `<img src>` 缩略图分支。

## 实际使用（用户搭建户型图）

- 底图（户型图）→ 现有 `image` 元素。
- 每个房间光照 overlay → `state-image`，绑定对应灯实体，层级置于底图之上。
- 灯泡交互图标 → 现有 `state-icon`，绑定同一实体，配置 onclick 调 `light.toggle`（或 `homeassistant.toggle`）。

## 非目标（YAGNI）

- 不做亮度联动透明度。
- 不做自定义"亮"状态值。
- overlay 不做点击交互。
- 不改动现有 image/state-icon/state-label 行为。
