# State Image 元素实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 ha-fusion 的 Picture Elements 编辑器中新增 `state-image` 元素类型——一个绑定 Home Assistant 实体的图片，根据实体 on/off 状态淡入淡出显示/隐藏 overlay。

**架构：** `state-image` 是一个带 `entity_id` 和 `src` 的 `Konva.Image`。因其 `type` 以 `state-` 开头，会自动进入现有状态订阅回调（筛选条件 `entity_id && type.startsWith('state-')`）。Viewer 侧新增 `updateStateImage()` 用 `Konva.Tween` 补间 opacity（on→配置值，off→0）；Editor 侧忽略实时状态、始终满显示以便定位。复用现有 `updateImage()` 图片加载与图片缓存机制。

**技术栈：** SvelteKit 5 + TypeScript + Konva.js。无单元测试框架，验证靠 `npm run check`（svelte-check/tsc）、`npm run lint`（prettier + eslint）与浏览器手动验证。

---

## 项目测试现状说明

本项目没有单元测试框架。每个任务的验证关卡为：
- `npm run check` — svelte-check + TypeScript 类型检查（必须无新增错误）
- 最终任务：`npm run lint` 与浏览器手动验证

因此本计划采用"实现 → 类型检查 → commit"的循环，而非 TDD 红绿循环。

---

## 文件结构

所有改动都在 `src/lib/Modal/PictureElements/` 目录内，无新建文件。各文件职责：

| 文件 | 本次职责 |
|------|---------|
| `icons.ts` | 新增 `state-image` 的工具栏图标 |
| `konvaBase.ts` | 新增 `updateStateImage()` 状态→opacity 补间方法；`getShapeAttrs()` 加序列化分支 |
| `konvaViewer.ts` | 挂载加载图片、创建/更新节点、状态订阅分派到 `updateStateImage` |
| `konvaEditor.ts` | 新增 `addStateImage()`；重建节点、属性更新、订阅时对 state-image 的处理 |
| `Toolbar.svelte` | 新增"Add State Image"按钮 |
| `SelectedAttributes.svelte` | 新增 state-image 的属性表单 |
| `ElementsPanel.svelte` | 图层列表缩略图支持 state-image |

---

## 任务 1：注册图标与序列化

**文件：**
- 修改：`src/lib/Modal/PictureElements/icons.ts`
- 修改：`src/lib/Modal/PictureElements/konvaBase.ts:437`（`getShapeAttrs` 的 Konva.Image 分支）

- [ ] **步骤 1：在 icons.ts 加图标**

在 `src/lib/Modal/PictureElements/icons.ts` 的 Toolbar.svelte 分组内，`'state-icon'` 行之后新增一行：

```typescript
	'state-label': 'majesticons:comment-text',
	'state-icon': 'mdi:lightbulb',
	'state-image': 'mdi:lightbulb-on',
	icon: 'mdi:shape',
```

- [ ] **步骤 2：在 getShapeAttrs 加序列化分支**

在 `src/lib/Modal/PictureElements/konvaBase.ts` 的 `getShapeAttrs()` 方法内，`Konva.Image` 分支中 `state-icon` 之后新增 `state-image` 分支。找到这段（约 405-412 行）：

```typescript
			} else if (type === 'state-icon') {
				attrs = {
					...attrs,
					entity_id: node.getAttr('entity_id'),
					state_color: node.getAttr('state_color'),
					color: node.getAttr('color')
				};
			}
```

改为：

```typescript
			} else if (type === 'state-icon') {
				attrs = {
					...attrs,
					entity_id: node.getAttr('entity_id'),
					state_color: node.getAttr('state_color'),
					color: node.getAttr('color')
				};
			} else if (type === 'state-image') {
				attrs = {
					...attrs,
					entity_id: node.getAttr('entity_id'),
					src: node.getAttr('src')
				};
			}
```

- [ ] **步骤 3：类型检查**

运行：`npm run check`
预期：无新增 TypeScript/svelte 错误。

- [ ] **步骤 4：Commit**

```bash
git add src/lib/Modal/PictureElements/icons.ts src/lib/Modal/PictureElements/konvaBase.ts
git commit -m "feat(picture-elements): 注册 state-image 图标与序列化字段"
```

---

## 任务 2：konvaBase 新增 updateStateImage 方法

**文件：**
- 修改：`src/lib/Modal/PictureElements/konvaBase.ts`（在 `updateStateLabel` 方法之后，约第 140 行后插入）

`updateStateImage` 根据实体状态把节点 opacity 补间到目标值。目标 opacity（"亮起时"透明度）存于自定义属性 `targetOpacity`；若不存在则用当前 `opacity` 作为目标并记录。用 `Konva.Tween` 做 250ms 过渡，切换前销毁上一个 tween 避免叠加（tween 实例存于节点自定义属性 `_stateTween`）。

- [ ] **步骤 1：实现 updateStateImage**

在 `src/lib/Modal/PictureElements/konvaBase.ts` 中，`updateStateLabel()` 方法（结束于约第 140 行 `}`）之后，`updateImage()` 之前，插入：

```typescript
	/**
	 * Handles updating `state-image`
	 * - reads entity state and tweens node opacity
	 * - on  -> fade to configured target opacity
	 * - off -> fade to 0
	 * target opacity is stored in `targetOpacity` (defaults to the
	 * persisted `opacity`, or 1 when unset)
	 */
	protected updateStateImage(node: Konva.Image, $states: HassEntities | undefined) {
		const entity_id = node.getAttr('entity_id');

		let targetOpacity = node.getAttr('targetOpacity');
		if (typeof targetOpacity !== 'number') {
			targetOpacity = typeof node.getAttr('opacity') === 'number' ? node.opacity() : 1;
			node.setAttr('targetOpacity', targetOpacity);
		}

		if (!$states) $states = get(states);

		const isOn = !!entity_id && $states?.[entity_id]?.state === 'on';
		const nextOpacity = isOn ? targetOpacity : 0;

		if (node.opacity() === nextOpacity) return;

		const prevTween = node.getAttr('_stateTween');
		if (prevTween) prevTween.destroy();

		const tween = new Konva.Tween({
			node,
			opacity: nextOpacity,
			duration: 0.25,
			easing: Konva.Easings.EaseInOut
		});
		node.setAttr('_stateTween', tween);
		tween.play();
	}
```

- [ ] **步骤 2：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 3：Commit**

```bash
git add src/lib/Modal/PictureElements/konvaBase.ts
git commit -m "feat(picture-elements): 新增 updateStateImage 状态-opacity 补间"
```

---

## 任务 3：konvaViewer 集成 state-image

**文件：**
- 修改：`src/lib/Modal/PictureElements/konvaViewer.ts`（`handleMount` 约 46-60、`subscribeStates` 约 85-91、`createNode` 约 248-251、`updateNode` 约 211-219）

Viewer 是仪表盘实际渲染层，需要：挂载时加载图片并把初始 opacity 设为 0（等首个状态推送再淡入）；状态订阅回调分派到 `updateStateImage`；创建/更新节点时处理 `state-image`。

- [ ] **步骤 1：handleMount 加载图片并初始隐藏**

在 `src/lib/Modal/PictureElements/konvaViewer.ts` 的 `handleMount()` 中，图片加载 switch（约 46-60 行）的 `case 'image':` 之前新增 `state-image` 分支。找到：

```typescript
					switch (type) {
						case 'icon':
						case 'state-icon':
							await this.updateIcon(node);
							break;
						case 'image':
```

改为：

```typescript
					switch (type) {
						case 'icon':
						case 'state-icon':
							await this.updateIcon(node);
							break;
						case 'state-image':
							await this.updateImage(node, node.getAttr('src'), false);
							if (typeof node.getAttr('targetOpacity') !== 'number') {
								node.setAttr('targetOpacity', node.opacity());
							}
							node.opacity(0);
							if (node.getAttr('id')) {
								const image = node.image();
								if (image instanceof HTMLImageElement) {
									this.updateImageCache(node.getAttr('id') as string, image);
								}
							}
							break;
						case 'image':
```

- [ ] **步骤 2：subscribeStates 分派 state-image**

在同文件 `subscribeStates()` 的 `nodes.forEach` 回调（约 85-91 行）中，为 `state-image` 增加分派。找到：

```typescript
				nodes.forEach((node) => {
					if (node instanceof Konva.Image) {
						this.updateStateIcon(node, $states);
					} else if (node instanceof Konva.Text) {
						this.updateStateLabel(node, $states);
					}
				});
```

改为：

```typescript
				nodes.forEach((node) => {
					if (node instanceof Konva.Image) {
						if (node.attrs.type === 'state-image') {
							this.updateStateImage(node, $states);
						} else {
							this.updateStateIcon(node, $states);
						}
					} else if (node instanceof Konva.Text) {
						this.updateStateLabel(node, $states);
					}
				});
```

- [ ] **步骤 3：createNode 加 state-image case**

在同文件 `createNode()` 的 switch（约 248 行）中，`case 'image':` 之前新增：

```typescript
			case 'state-image':
				node = new Konva.Image(attrs);
				await this.updateImage(node, attrs?.src, false);
				if (typeof node.getAttr('targetOpacity') !== 'number') {
					node.setAttr('targetOpacity', node.opacity());
				}
				node.opacity(0);
				this.updateStateImage(node, undefined);
				break;
			case 'image':
```

- [ ] **步骤 4：updateNode 处理 state-image 图片重载**

在同文件 `updateNode()` 中，`node instanceof Konva.Image` 的 if 链（约 211-219 行）里，为 `state-image` 增加图片重载。找到：

```typescript
		if (node instanceof Konva.Image) {
			if (type === 'state-icon') {
				await this.updateStateIcon(node, undefined);
			} else if (type === 'icon') {
				await this.updateIcon(node);
			} else if (type === 'image') {
				await this.updateImage(node, node.getAttr('src'), false);
			}
		}
```

改为：

```typescript
		if (node instanceof Konva.Image) {
			if (type === 'state-icon') {
				await this.updateStateIcon(node, undefined);
			} else if (type === 'icon') {
				await this.updateIcon(node);
			} else if (type === 'image') {
				await this.updateImage(node, node.getAttr('src'), false);
			} else if (type === 'state-image') {
				await this.updateImage(node, node.getAttr('src'), false);
				this.updateStateImage(node, undefined);
			}
		}
```

- [ ] **步骤 5：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 6：Commit**

```bash
git add src/lib/Modal/PictureElements/konvaViewer.ts
git commit -m "feat(picture-elements): viewer 集成 state-image 渲染与状态订阅"
```

---

## 任务 4：konvaEditor 新增 addStateImage 与交互处理

**文件：**
- 修改：`src/lib/Modal/PictureElements/konvaEditor.ts`（`addImage` 之后新增 `addStateImage`；`localAddNode` 约 936-959；`subscribeStates` 约 738-745；`updateAttr` 约 1307-1339）

编辑器忽略实时状态、始终满显示便于定位。因此 editor 的 `subscribeStates` 对 state-image 跳过 opacity 变更；`addStateImage` 创建节点后不做状态隐藏。

- [ ] **步骤 1：新增 addStateImage 方法**

在 `src/lib/Modal/PictureElements/konvaEditor.ts` 的 `addImage()` 方法（结束于约 1914 行）之后新增：

```typescript
	/**
	 * Add state-image
	 * - like `addImage` but bound to an entity's on/off state
	 * - editor always shows it at full opacity for positioning
	 */
	public async addStateImage() {
		const src = 'https://demo.home-assistant.io/stub_config/t-shirt-promo.png';

		try {
			const image = await this.loadImage(src);

			const node = new Konva.Image({
				type: 'state-image',
				name: 'State Image',
				entity_id: '',
				image,
				src,
				width: image.naturalWidth || 64,
				height: image.naturalHeight || 64,
				draggable: true
			});

			this.handleAddNode(node);
		} catch (err) {
			console.error('error adding state-image:', err);

			const node = new Konva.Image({
				type: 'state-image',
				name: 'State Image',
				entity_id: '',
				image: undefined,
				src,
				width: 100,
				height: 100,
				draggable: true
			});

			this.handleAddNode(node);
			await this.updateImage(node, src, false);
		}
	}
```

- [ ] **步骤 2：localAddNode 支持 state-image**

在同文件 `applyState()` 内的 `localAddNode()`（约 936 行）中，把 `state-image` 加入 image/icon/state-icon 组。找到：

```typescript
				case 'image':
				case 'icon':
				case 'state-icon': {
					node = new Konva.Image(attrs);
```

改为：

```typescript
				case 'image':
				case 'icon':
				case 'state-icon':
				case 'state-image': {
					node = new Konva.Image(attrs);
```

并在同 case 内，处理 `state-icon`/`icon` 的分支（约 952-956 行）保持不变即可——`state-image` 不需要额外图标处理，图片已由 `updateImage`（约 945 行的 else 分支）或缓存加载。确认该段为：

```typescript
					if (type === 'state-icon') {
						this.updateStateIcon(node as Konva.Image, undefined);
					} else if (type === 'icon') {
						this.updateIcon(node as Konva.Image);
					}
```

无需修改（state-image 不进入这两个分支，编辑器保持满 opacity 显示）。

- [ ] **步骤 3：subscribeStates 对 state-image 跳过**

在同文件 `subscribeStates()`（约 738-745 行）中，确保 state-image 不被当作 state-icon 处理。找到：

```typescript
				shapes.forEach((node) => {
					if (!this.transformer.nodes().includes(node)) {
						if (node instanceof Konva.Image) {
							this.updateStateIcon(node, $states);
						} else if (node instanceof Konva.Text) {
							this.updateStateLabel(node, $states);
						}
					}
				});
```

改为：

```typescript
				shapes.forEach((node) => {
					if (!this.transformer.nodes().includes(node)) {
						if (node instanceof Konva.Image) {
							// state-image is not previewed by state in the editor
							if (node.attrs.type !== 'state-image') {
								this.updateStateIcon(node, $states);
							}
						} else if (node instanceof Konva.Text) {
							this.updateStateLabel(node, $states);
						}
					}
				});
```

- [ ] **步骤 4：updateAttr 处理 state-image 的 entity_id**

在同文件 `updateAttr()` 的 switch（约 1307 行起）中，为 state-image 的 entity_id 增加分支（仅 setAttr，不触发图标/opacity 逻辑）。在 `state-label` 的 entity_id case（约 1336-1339 行）之后新增：

找到：

```typescript
			case type === 'state-label' && key === 'entity_id' && node instanceof Konva.Text:
				node.setAttr('entity_id', value);
				this.updateStateLabel(node, undefined);
				break;
```

在其后新增：

```typescript
			case type === 'state-image' && key === 'entity_id' && node instanceof Konva.Image:
				node.setAttr('entity_id', value);
				break;
```

注意：`key === 'src'` 的通用 case（约 1308 行）已能处理 state-image 的图片更新（`node instanceof Konva.Image` 为真），无需额外分支。

- [ ] **步骤 5：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 6：Commit**

```bash
git add src/lib/Modal/PictureElements/konvaEditor.ts
git commit -m "feat(picture-elements): editor 支持添加与配置 state-image"
```

---

## 任务 5：Toolbar 新增按钮

**文件：**
- 修改：`src/lib/Modal/PictureElements/Toolbar.svelte`（约第 55 行，state-icon 按钮之后）

- [ ] **步骤 1：新增 Add State Image 按钮**

在 `src/lib/Modal/PictureElements/Toolbar.svelte` 中，"Add New State Icon" 按钮（约 53-55 行）之后新增：

找到：

```svelte
<button title="Add New State Icon" onclick={() => konva.addStateIcon()}>
	<Icon icon={icons?.['state-icon']} width="20" height="20" />
</button>

<span class="divider"></span>
```

改为：

```svelte
<button title="Add New State Icon" onclick={() => konva.addStateIcon()}>
	<Icon icon={icons?.['state-icon']} width="20" height="20" />
</button>

<button title="Add New State Image" onclick={() => konva.addStateImage()}>
	<Icon icon={icons?.['state-image']} width="20" height="20" />
</button>

<span class="divider"></span>
```

- [ ] **步骤 2：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 3：Commit**

```bash
git add src/lib/Modal/PictureElements/Toolbar.svelte
git commit -m "feat(picture-elements): 工具栏新增 state-image 按钮"
```

---

## 任务 6：SelectedAttributes 属性表单

**文件：**
- 修改：`src/lib/Modal/PictureElements/SelectedAttributes.svelte`（约第 162 行，`type === 'image'` 分支之前）

state-image 表单字段：Entity（带 entityOptions 下拉）、Source、Width、Height、Opacity。

- [ ] **步骤 1：新增 state-image 分支**

在 `src/lib/Modal/PictureElements/SelectedAttributes.svelte` 的 `$effect` 中，`} else if (selectedShape?.attrs?.type === 'image') {`（约 162 行）之前新增分支：

```svelte
		} else if (selectedShape?.attrs?.type === 'state-image') {
			// STATE IMAGE
			attributes = [
				{
					id: 'entity_id',
					label: 'Entity',
					type: 'text',
					className: 'grow-item',
					disabled: !selectedShape?.attrs?.draggable,
					value: selectedShape?.attrs?.entity_id,
					list: 'entityOptions'
				},
				{
					id: 'src',
					label: 'Source',
					value: selectedShape?.attrs?.src,
					type: 'text',
					className: 'grow-item',
					disabled: !selectedShape?.attrs?.draggable
				},
				{
					id: 'width',
					label: 'Width',
					type: 'text',
					unit: ' px',
					value: selectedShape?.attrs?.width,
					disabled: !selectedShape?.attrs?.draggable
				},
				{
					id: 'height',
					label: 'Height',
					type: 'text',
					unit: ' px',
					value: selectedShape?.attrs?.height,
					disabled: !selectedShape?.attrs?.draggable
				},
				{ ...opacity }
			];
		} else if (selectedShape?.attrs?.type === 'image') {
```

- [ ] **步骤 2：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 3：Commit**

```bash
git add src/lib/Modal/PictureElements/SelectedAttributes.svelte
git commit -m "feat(picture-elements): state-image 属性表单"
```

---

## 任务 7：ElementsPanel 图层缩略图

**文件：**
- 修改：`src/lib/Modal/PictureElements/ElementsPanel.svelte`（约第 223 行，`type === 'image'` 缩略图分支）

让图层列表对 state-image 显示与 image 相同的图片缩略图。

- [ ] **步骤 1：缩略图分支加入 state-image**

在 `src/lib/Modal/PictureElements/ElementsPanel.svelte` 中找到（约 223 行）：

```svelte
				{:else if shape?.attrs?.type === 'image'}
					<div class="thumbnail">
```

改为：

```svelte
				{:else if shape?.attrs?.type === 'image' || shape?.attrs?.type === 'state-image'}
					<div class="thumbnail">
```

- [ ] **步骤 2：类型检查**

运行：`npm run check`
预期：无新增错误。

- [ ] **步骤 3：Commit**

```bash
git add src/lib/Modal/PictureElements/ElementsPanel.svelte
git commit -m "feat(picture-elements): 图层列表支持 state-image 缩略图"
```

---

## 任务 8：整体验证与手动测试

**文件：** 无代码改动，仅验证。

- [ ] **步骤 1：类型检查 + lint**

运行：`npm run check && npm run lint`
预期：无错误。若 lint 报格式问题，运行 `npm run format` 后重新提交。

- [ ] **步骤 2：启动 dev server 手动验证**

运行：`npm run dev`

在浏览器中验证以下场景（需连接一个 Home Assistant 实例，或用已有配置）：

1. 进入编辑模式，打开一个 Picture Elements 部件的编辑器。
2. 工具栏点击"State Image"按钮，确认能添加一个图片元素、以满 opacity 显示。
3. 选中它，在属性面板设置 Entity（选一个 light 或 switch）、Source（overlay 图 URL）、Opacity。
4. 确认图层列表显示该元素的图片缩略图。
5. 关闭编辑器，确认配置被持久化（重新打开编辑器数据仍在）。
6. 退出编辑模式回到仪表盘：
   - 实体为 on 时 → overlay 淡入显示。
   - 实体为 off 时 → overlay 淡出隐藏。
   - 切换实体状态 → overlay 平滑淡入/淡出。
   - overlay 不响应鼠标点击（点击穿透，不触发服务）。

- [ ] **步骤 3：完成收尾**

确认所有任务的 commit 已完成，工作区干净（`git status`）。参考 finishing-a-development-branch 技能决定合并/PR。

---

## 自检记录

**规格覆盖度：**
- 显隐规则 on/off → 任务 2 `updateStateImage`。
- 通用实体（非仅 light）→ 任务 2 用 `state === 'on'` 判断，不限域。
- 淡入淡出 → 任务 2 `Konva.Tween` 250ms。
- 不接收点击 → state-image 无 onclick，viewer 的 `handleNodeClick` 已 `listening(!!onclick)` 天然为 false（任务 3 未绑定 click）。
- 编辑器满显示 → 任务 4 步骤 3 跳过 state-image opacity 变更 + 步骤 1 不做状态隐藏。
- 持久化字段 entity_id/src → 任务 1 步骤 2 `getShapeAttrs`。
- 7 文件改动 → 任务 1-7 全覆盖。

**占位符扫描：** 无 TODO/待定，所有步骤含完整代码。

**类型一致性：** 方法名 `updateStateImage`、`addStateImage`、属性 `targetOpacity`/`_stateTween`/`entity_id`/`src` 在各任务间一致。
