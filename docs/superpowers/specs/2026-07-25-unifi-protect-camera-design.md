# UniFi Protect Camera Card — Design Spec

## 概述

在现有通用摄像头卡片基础上，新增一个 UniFi Protect 专属摄像头卡片（类型 `unifi-camera`），聚焦于安防监控场景。自适应布局：空闲时全幅流 + 简洁 overlay，运动/门铃事件时自动展开事件面板。

## 核心功能

1. **实时视频流** — 复用现有 HLS/WebRTC/Proxy 流层（不修改）
2. **在线状态指示** — 4px 绿/灰色圆点
3. **智能检测标签** — 人、车辆、动物、包裹的药丸形标签，检测到时高亮
4. **意识环** — 卡片内缘 2px 边框，运动时琥珀色、门铃时红色脉冲
5. **事件面板** — 运动/门铃触发时从底部滑入，显示缩略图和详情
6. **自动实体发现** — 选 camera 实体后，通过 entity_id 前缀匹配找相关传感器

## 数据模型

### 类型定义 (Types.ts)

```typescript
interface UnifiCameraItem extends CameraItem {
  type: 'unifi-camera';
  entity_id: string;              // camera.* 主实体
  
  // 以下由自动发现填充，可手动覆盖
  motion_sensor?: string;         // binary_sensor.*_motion
  doorbell_sensor?: string;       // binary_sensor.*_doorbell (门铃摄像头)
  event_sensor?: string;          // sensor.*_event — 提供事件类型、缩略图、时间
}
```

### UniFi Protect 实体命名规律

以 `camera.front_door` 为例，关联实体：
| 实体 | 用途 |
|---|---|
| `camera.front_door` | 视频流 |
| `binary_sensor.front_door_motion` | 运动/智能检测事件 on/off |
| `sensor.front_door_event` | 最新事件详情（类型、缩略图 URL、时间戳） |
| `binary_sensor.front_door_doorbell` | 门铃按下（仅门铃摄像头） |

### 自动发现逻辑

1. 用户选择 `camera.*` 实体
2. 提取基底名称：`camera.front_door` → `front_door`
3. 在实体列表中匹配：
   - `binary_sensor.<base>_motion`
   - `binary_sensor.<base>_doorbell`
   - `sensor.<base>_event`
4. 自动填充到卡片配置
5. 用户可在配置面板中手动覆盖任何绑定

## 组件架构

```
UnifiCamera.svelte (新建)
├── HLS | WebRTC | Proxy     ← 复用 src/lib/Main/Camera/ 子组件
├── Overlay.svelte            ← 底部 overlay
│   ├── 在线状态灯 (4px 圆点)
│   ├── 摄像头名称
│   └── 智能检测标签 (药丸，动态)
├── AwarenessRing             ← 内缘边框（CSS 实现，非独立组件）
└── EventPanel.svelte         ← 事件时从底部滑入
    ├── 事件类型图标 + 时间
    └── 事件缩略图
```

### 文件规划

```
src/lib/Main/UnifiCamera.svelte
src/lib/Main/UnifiCamera/Overlay.svelte
src/lib/Main/UnifiCamera/EventPanel.svelte
src/lib/Modal/UnifiCameraConfig.svelte  (新建)
```

Sidebar 中的摄像头仍使用 `Sidebar/Camera.svelte`（包装 Main Camera），UniFi 版同样方式包装。

## 交互与状态机

### 状态定义

| 状态 | 触发条件 | 视觉表现 |
|---|---|---|
| **idle** | motion_sensor = off, 摄像头在线 | 全幅流 + 简洁 overlay，意识环安静蓝色 |
| **aware** | motion_sensor = on | 意识环琥珀色，对应检测标签高亮弹跳，事件面板滑入 |
| **doorbell** | doorbell_sensor = on | 意识环红色脉冲 ×3，事件面板红色强调，门铃图标脉冲 |
| **offline** | camera unavailable | 灰色蒙层 + GPU 纹理 + "离线"，灰点 |
| **recording** | 未来扩展 | 红色录制指示圆点 |

### 状态转移

```
idle ──motion=on──▶ aware ──doorbell=on──▶ doorbell
  ▲                                   │
  │    doorbell=off                   │
  ├───────────────────────────────────┘
  │    motion=off (delay 5s)
  └─────────────────────────────────── aware ──motion=off──▶ idle
  
any state ──entity unavailable──▶ offline
offline ──entity available─────▶ idle
```

### 动画时序

| 触发 | 动画 | 时长 | 缓动 |
|---|---|---|---|
| motion off→on | 意识环 默认→琥珀 | 400ms | ease-out |
| motion off→on | 检测标签弹跳 (1→1.3→1) | 400ms | cubic-bezier(0.34, 1.56, 0.64, 1) |
| motion off→on | 事件面板滑入 | 350ms | ease-out |
| motion off→on | 缩略图淡入 | 500ms | ease-out |
| doorbell on | 意识环红色脉冲 ×3 | ~1.8s total | ease-in-out |
| motion on→off | 事件面板滑出 | 300ms | ease-in |
| motion on→off | 意识环恢复 | 600ms | ease-out |
| idle hover | 卡片微升 2px + 阴影加深 | 200ms | ease-out |

## 配色策略

**融入现有主题**，不引入独立色彩体系：

| 元素 | 颜色来源 |
|---|---|
| 卡片底色 | `rgba(0, 0, 0, 0.2)` |
| overlay 毛玻璃 | `rgba(0, 0, 0, 0.15)` + `backdrop-filter: blur(0.4rem)` |
| 名称文字 | `--theme-button-name-color-off` |
| 副文字/时间戳 | `--theme-button-state-color-off` |
| 圆角 | `--theme-border-radius` |

仅 3 个语义色（用量极少，仅在状态指示器上使用）：

```
--unifi-online:    #4ade80   在线绿点
--unifi-motion:    #f59e0b   运动/检测琥珀
--unifi-doorbell:  #ef4444   门铃红
```

所有主题相关颜色走 `--theme-*` CSS 变量，换主题自动适配。

## 检测标签设计

药丸形标签，图标 + 计数：

- **人** `mdi:human` · **车** `mdi:car` · **动物** `mdi:paw` · **包裹** `mdi:package-variant-closed`
- 空闲态：半透明底色 `rgba(255,255,255,0.08)`，图标淡色
- 检测到某类型：对应标签底色变为主色调 12% 透明度 + 图标全色
- 检测类型由 `event_sensor` 的状态/属性判断，或在 `motion_sensor` 状态变化时通过事件属性解析

## 兼容性

- 如果用户只选了 `camera.*` 而没有 UniFi Protect 传感器 → 退化为普通摄像头卡片（overlay 只有名称，无检测标签，无事件面板）
- 有 `motion_sensor` 但无 `event_sensor` → 运动指示 + 标签正常，事件面板无缩略图
- 非 UniFi Protect 摄像头也可使用此卡片（配置为手动绑定传感器）

## 配置面板

`UnifiCameraConfig.svelte`：
1. 选择摄像头实体 → 自动发现关联传感器
2. 显示自动匹配结果（motion / doorbell / event），允许手动修改
3. 现有 CameraConfig 的设置（stream、size、overlay 可见性、移动端可见性）照常提供
4. 实时预览

## 范围外（后续迭代）

- 录像回放/HLS 片段播放
- 多路摄像头网格视图
- 双向对讲（UniFi Talk）
- PTZ 云台控制
