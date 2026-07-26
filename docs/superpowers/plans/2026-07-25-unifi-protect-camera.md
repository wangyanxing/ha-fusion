# UniFi Protect Camera Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a UniFi Protect adaptive camera card (`unifi-camera` type) that composes the existing Camera streaming component with a custom overlay, detection tags, awareness ring, and auto-expanding event panel.

**Architecture:** `UnifiCamera.svelte` wraps the existing `Camera.svelte` for HLS/WebRTC/Proxy streaming (DRY), then layers Unifi-specific UI on top via absolute positioning. Three state-dependent visual layers: awareness ring (CSS border), overlay (status dot + name + detection tags), event panel (slide-up thumbnail + details). Auto-discovery of related sensors by entity_id naming pattern.

**Tech Stack:** Svelte 5 (runes), TypeScript, @iconify/svelte, existing theme CSS variables

## Global Constraints

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — no legacy stores-based reactivity
- All colors from `--theme-*` CSS variables; only online/motion/doorbell semantic colors are hardcoded
- Follow existing code patterns: same file structure, same import style, same naming
- Components must pass `npm run check` (type-check) without errors
- Translation keys required for any user-visible text

---

### Task 1: Type definitions + auto-discovery utility

**Files:**
- Modify: `src/lib/Types.ts` (add UnifiCameraItem + update Item union)
- Modify: `src/lib/Utils.ts` (add discoverUnifiEntities helper)

**Interfaces:**
- Produces: `UnifiCameraItem` type, `discoverUnifiEntities()` function

- [ ] **Step 1: Add UnifiCameraItem interface to Types.ts**

In `src/lib/Types.ts`, add after the `CameraItem` interface (line 231):

```typescript
export interface UnifiCameraItem extends CameraItem {
    type: 'unifi-camera';
    /** binary_sensor.*_motion — auto-discovered, triggers adaptive expansion */
    motion_sensor?: string;
    /** binary_sensor.*_doorbell — auto-discovered, triggers doorbell pulse */
    doorbell_sensor?: string;
    /** sensor.*_event — auto-discovered, provides event thumbnail + type */
    event_sensor?: string;
}
```

- [ ] **Step 2: Update Item union type in Types.ts**

In `src/lib/Types.ts` line 41-49, add `UnifiCameraItem` to the union:

```typescript
export type Item =
    | ButtonItem
    | CameraItem
    | EmptyItem
    | DaysSinceItem
    | EntitiesItem
    | SpotifyPlayerItem
    | ThermostatItem
    | VacuumItem
    | UnifiCameraItem;
```

- [ ] **Step 3: Add discoverUnifiEntities to Utils.ts**

In `src/lib/Utils.ts`, append before the last line:

```typescript
/**
 * Auto-discovers UniFi Protect related entities based on a camera entity_id.
 * Matches by entity_id naming convention: camera.<base> → binary_sensor.<base>_motion, etc.
 */
export function discoverUnifiEntities(
    cameraEntityId: string | undefined,
    allEntityIds: string[]
): { motion_sensor?: string; doorbell_sensor?: string; event_sensor?: string } {
    if (!cameraEntityId?.startsWith('camera.')) return {};
    
    const base = cameraEntityId.substring(7); // strip 'camera.' prefix
    
    const result: { motion_sensor?: string; doorbell_sensor?: string; event_sensor?: string } = {};
    
    for (const id of allEntityIds) {
        if (id === `binary_sensor.${base}_motion`) result.motion_sensor = id;
        else if (id === `binary_sensor.${base}_doorbell`) result.doorbell_sensor = id;
        else if (id === `sensor.${base}_event`) result.event_sensor = id;
    }
    
    return result;
}
```

- [ ] **Step 4: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS (no new errors)

- [ ] **Step 5: Commit**

```bash
git add src/lib/Types.ts src/lib/Utils.ts
git commit -m "feat: add UnifiCameraItem type and discoverUnifiEntities helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: UnifiCamera Overlay + EventPanel sub-components

**Files:**
- Create: `src/lib/Main/UnifiCamera/Overlay.svelte`
- Create: `src/lib/Main/UnifiCamera/EventPanel.svelte`

**Interfaces:**
- Produces: `<Overlay>` and `<EventPanel>` Svelte components

#### Overlay.svelte

Props: `isOnline: boolean`, `entity: HassEntity | undefined`, `sel: UnifiCameraItem`, `detectionTags: {type: string, label: string, active: boolean, icon: string}[]`

```svelte
<script lang="ts">
    import Icon from '@iconify/svelte';
    import { getName } from '$lib/Utils';
    import type { HassEntity } from 'home-assistant-js-websocket';
    import type { UnifiCameraItem } from '$lib/Types';

    let {
        isOnline,
        entity,
        sel,
        detectionTags = []
    }: {
        isOnline: boolean;
        entity: HassEntity | undefined;
        sel: UnifiCameraItem;
        detectionTags: { type: string; label: string; active: boolean; icon: string }[];
    } = $props();
</script>

<div class="overlay">
    <div class="left">
        <!-- online status dot -->
        <span class="status-dot" class:online={isOnline} class:offline={!isOnline}></span>
        <span class="name">{getName(undefined, entity)}</span>
    </div>

    {#if detectionTags.length > 0}
        <div class="tags">
            {#each detectionTags as tag (tag.type)}
                <span class="tag" class:active={tag.active} title={tag.label}>
                    <Icon icon={tag.icon} width="0.9rem" height="none" />
                </span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .overlay {
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 2;
        background-color: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(0.4rem);
        -webkit-backdrop-filter: blur(0.4rem);
        padding: 0.55rem 0.75rem;
        border-radius: 0 0 var(--theme-border-radius, 0.4rem) var(--theme-border-radius, 0.4rem);
        pointer-events: none;
    }

    .left {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
    }

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .status-dot.online { background: #4ade80; }
    .status-dot.offline { background: #6b7280; }

    .name {
        color: var(--theme-button-name-color-off);
        font-weight: 500;
        font-size: 0.95rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .tags {
        display: flex;
        gap: 0.3rem;
        flex-shrink: 0;
    }

    .tag {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.2rem;
        border-radius: 0.3rem;
        color: rgba(255, 255, 255, 0.3);
        background: rgba(255, 255, 255, 0.06);
        transition: all 300ms ease;
    }

    .tag.active {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.15);
    }
</style>
```

#### EventPanel.svelte

Props: `visible: boolean`, `motionActive: boolean`, `doorbellActive: boolean`, `eventEntity: HassEntity | undefined`, `eventPreviewUrl: string`

```svelte
<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { HassEntity } from 'home-assistant-js-websocket';
    import { relativeTime } from '$lib/Utils';
    import { selectedLanguage } from '$lib/Stores';

    let {
        visible,
        motionActive,
        doorbellActive,
        eventEntity,
        eventPreviewUrl
    }: {
        visible: boolean;
        motionActive: boolean;
        doorbellActive: boolean;
        eventEntity: HassEntity | undefined;
        eventPreviewUrl: string;
    } = $props();

    let timestamp = $derived(eventEntity?.state ?? eventEntity?.attributes?.event_time);
    let eventType = $derived(eventEntity?.attributes?.event_type ?? eventEntity?.attributes?.event_object ?? '');

    let timeAgo = $derived(timestamp ? relativeTime(timestamp, $selectedLanguage) : '');
</script>

{#if visible}
    <div class="event-panel" class:doorbell={doorbellActive} class:motion={motionActive}>
        <div class="event-info">
            <div class="event-type">
                {#if doorbellActive}
                    <Icon icon="mdi:bell-ring" width="1.1rem" height="none" />
                {:else}
                    <Icon icon="mdi:motion-sensor" width="1.1rem" height="none" />
                {/if}
                <span>
                    {#if eventType}
                        {eventType.charAt(0).toUpperCase() + eventType.slice(1)}
                    {:else if doorbellActive}
                        Doorbell pressed
                    {:else}
                        Motion detected
                    {/if}
                </span>
                {#if timeAgo}
                    <span class="time">&middot; {timeAgo}</span>
                {/if}
            </div>
        </div>

        {#if eventPreviewUrl}
            <div class="thumbnail">
                <img src={eventPreviewUrl} alt="Event snapshot" />
            </div>
        {/if}
    </div>
{/if}

<style>
    .event-panel {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 3;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(0.5rem);
        -webkit-backdrop-filter: blur(0.5rem);
        padding: 0.5rem 0.75rem 0.6rem;
        border-radius: 0 0 var(--theme-border-radius, 0.4rem) var(--theme-border-radius, 0.4rem);
        animation: slideUp 350ms ease-out;
    }

    .event-panel.doorbell {
        background: rgba(239, 68, 68, 0.15);
    }

    @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    .event-info {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.35rem;
    }

    .event-type {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--theme-button-name-color-off);
        font-size: 0.85rem;
        font-weight: 500;
    }

    .event-panel.doorbell .event-type {
        color: #ef4444;
    }

    .event-panel.motion .event-type {
        color: #f59e0b;
    }

    .time {
        color: var(--theme-button-state-color-off);
        font-weight: 400;
    }

    .thumbnail {
        border-radius: 0.3rem;
        overflow: hidden;
        aspect-ratio: 16/9;
        max-height: 8rem;
        background: rgba(0, 0, 0, 0.3);
    }

    .thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
</style>
```

- [ ] **Step 1: Create Overlay.svelte**

Paste the Overlay component code above into `src/lib/Main/UnifiCamera/Overlay.svelte`.

- [ ] **Step 2: Create EventPanel.svelte**

Paste the EventPanel component code above into `src/lib/Main/UnifiCamera/EventPanel.svelte`.

- [ ] **Step 3: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/Main/UnifiCamera/
git commit -m "feat: add UnifiCamera Overlay and EventPanel sub-components

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Camera clickDisabled prop + UnifiCamera main component

**Files:**
- Modify: `src/lib/Main/Camera.svelte` (add `clickDisabled` prop)
- Create: `src/lib/Main/UnifiCamera.svelte`

**Interfaces:**
- Consumes: `UnifiCameraItem` from Task 1, `Overlay` + `EventPanel` from Task 2
- Produces: `<UnifiCamera>` component with exact same props interface as existing `<Camera>` (interchangeable)

- [ ] **Step 1: Add clickDisabled prop to Camera.svelte**

In `src/lib/Main/Camera.svelte`, add the `clickDisabled` prop to the component props destructuring (line 13-20):

```typescript
let {
    sel,
    demo = undefined,
    responsive,
    muted,
    controls,
    clickDisabled = false  // ADD THIS LINE
}: {
    sel: CameraItem;
    demo?: string | undefined;
    responsive: boolean;
    muted: boolean;
    controls: boolean;
    clickDisabled?: boolean;  // ADD THIS LINE
} = $props();
```

Then modify `handleClick` (line 73) to respect it:

```typescript
function handleClick() {
    if (responsive || clickDisabled) return;  // ADD clickDisabled check
    // ... rest unchanged
}
```

- [ ] **Step 2: Create UnifiCamera.svelte**

Create `src/lib/Main/UnifiCamera.svelte`:

```svelte
<script lang="ts">
    import Camera from '$lib/Main/Camera.svelte';
    import Overlay from '$lib/Main/UnifiCamera/Overlay.svelte';
    import EventPanel from '$lib/Main/UnifiCamera/EventPanel.svelte';
    import { editMode, states } from '$lib/Stores';
    import { openModal } from '$lib/Modals';
    import type { UnifiCameraItem } from '$lib/Types';

    let {
        sel,
        demo = undefined,
        responsive,
        muted,
        controls
    }: {
        sel: UnifiCameraItem;
        demo?: string | undefined;
        responsive: boolean;
        muted: boolean;
        controls: boolean;
    } = $props();

    /** Camera entity for stream layer */
    let entity = $derived(
        (demo && $states?.[demo]) || (sel?.entity_id ? $states?.[sel?.entity_id] : undefined)
    );

    /** Camera entity state value (for online/offline) */
    let isOnline = $derived(
        entity?.state !== 'unavailable' && entity?.state !== 'unknown'
    );

    /** Motion sensor state — triggers awareness mode */
    let motionEntity = $derived(
        sel?.motion_sensor ? $states?.[sel.motion_sensor] : undefined
    );
    let motionActive = $derived(motionEntity?.state === 'on');

    /** Doorbell sensor state — triggers doorbell pulse */
    let doorbellEntity = $derived(
        sel?.doorbell_sensor ? $states?.[sel.doorbell_sensor] : undefined
    );
    let doorbellActive = $derived(doorbellEntity?.state === 'on');

    /** Event sensor — provides thumbnail and event type */
    let eventEntity = $derived(
        sel?.event_sensor ? $states?.[sel.event_sensor] : undefined
    );

    /** Event panel should be visible when motion or doorbell is active */
    let eventPanelVisible = $derived((motionActive || doorbellActive) && !$editMode);

    /** Event thumbnail URL from event sensor attributes or entity_picture */
    let eventPreviewUrl = $derived(
        eventEntity?.attributes?.entity_picture ||
        eventEntity?.attributes?.event_thumbnail ||
        ''
    );

    /**
     * Detection tags derived from motion sensor or event sensor attributes.
     * UniFi Protect event_object attribute: 'person', 'vehicle', 'animal', 'package'
     */
    let detectionTags = $derived.by(() => {
        const types = [
            { type: 'person', icon: 'mdi:human', label: 'Person' },
            { type: 'vehicle', icon: 'mdi:car', label: 'Vehicle' },
            { type: 'animal', icon: 'mdi:paw', label: 'Animal' },
            { type: 'package', icon: 'mdi:package-variant-closed', label: 'Package' }
        ];

        if (!motionEntity && !eventEntity) return [];

        // Get the active detection types from attributes
        const eventObjects: string[] = eventEntity?.attributes?.event_object
            ? [eventEntity.attributes.event_object]
            : motionEntity?.attributes?.event_object
                ? [motionEntity.attributes.event_object]
                : [];

        return types.map(t => ({
            ...t,
            active: motionActive && (eventObjects.length === 0 || eventObjects.includes(t.type))
        }));
    });

    /** Derived camera config — suppress built-in overlay from Camera component */
    let cameraConfig = $derived({
        ...sel,
        hide_overlay: true
    });

    /** Container CSS classes */
    let containerClass = $derived.by(() => {
        const classes = ['unifi-container'];
        if (motionActive) classes.push('aware');
        if (doorbellActive) classes.push('doorbell');
        if (!isOnline && !$editMode) classes.push('offline');
        return classes.join(' ');
    });

    function handleClick() {
        if (responsive) return;
        if ($editMode) {
            openModal(() => import('$lib/Modal/UnifiCameraConfig.svelte'), { sel });
        } else {
            openModal(() => import('$lib/Modal/CameraModal.svelte'), { sel });
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class={containerClass}
    onclick={handleClick}
    style:cursor={$editMode || responsive ? 'unset' : 'pointer'}
    style:height={responsive ? '100%' : 'calc(var(--theme-item-height, 61.35px) * 4 + 0.4rem * 3)'}
    style:width={responsive ? '100%' : 'calc(14.5rem * 2 + 0.4rem)'}
>
    <!-- Stream layer: reuse existing Camera component (HLS/WebRTC/Proxy) -->
    <!-- clickDisabled=true: Camera's internal button ignores clicks, UnifiCamera handles them -->
    <div class="stream-layer">
        <Camera sel={cameraConfig} {responsive} {muted} {controls} clickDisabled={true} />
    </div>

    <!-- Click-capture layer: sits above Camera's button, handles click events -->
    <div class="click-capture" onclick={handleClick}></div>

    <!-- Overlay: always visible (idle state), with status dot + name + detection tags -->
    {#if muted && !responsive}
        <Overlay {isOnline} {entity} {sel} {detectionTags} />
    {/if}

    <!-- Event panel: slides up when motion/doorbell active -->
    <EventPanel
        visible={eventPanelVisible}
        {motionActive}
        {doorbellActive}
        {eventEntity}
        {eventPreviewUrl}
    />
</div>

<style>
    .unifi-container {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: var(--theme-border-radius, 0.6rem);
        position: relative;
        color: white;
        overflow: hidden;
        display: grid;
        box-sizing: border-box;
        --ring-color: rgba(96, 165, 250, 0.4);
        transition: box-shadow 400ms ease-out;
        box-shadow: inset 0 0 0 2px transparent;
    }

    /* Stream fills the container */
    .stream-layer {
        position: absolute;
        inset: 0;
        z-index: 0;
    }

    /* Click-capture sits above Camera's own button but below Overlay/EventPanel */
    .click-capture {
        position: absolute;
        inset: 0;
        z-index: 1;
    }

    /* Awareness ring — idle (blue-ish tint) */
    .unifi-container {
        box-shadow: inset 0 0 0 2px rgba(96, 165, 250, 0.25);
    }

    /* Awareness ring — motion detected (amber) */
    .unifi-container.aware {
        box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.55);
        animation: ring-breathe 2s ease-in-out infinite;
    }

    /* Awareness ring — doorbell (red pulse ×3) */
    .unifi-container.doorbell {
        box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.7);
        animation: ring-pulse 0.6s ease-in-out 3;
    }

    /* Both aware and doorbell — red wins */
    .unifi-container.doorbell.aware {
        box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.7);
        animation: ring-pulse 0.6s ease-in-out 3;
    }

    /* Offline overlay */
    .unifi-container.offline {
        box-shadow: inset 0 0 0 2px rgba(107, 114, 128, 0.3);
    }
    .unifi-container.offline::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 1;
        border-radius: inherit;
        pointer-events: none;
    }

    /* Hover — subtle lift */
    @media (hover: hover) {
        .unifi-container:not(.offline):hover {
            transform: translateY(-1px);
            box-shadow: inset 0 0 0 2px var(--ring-color, rgba(96, 165, 250, 0.4)),
                        0 4px 12px rgba(0, 0, 0, 0.3);
        }
    }

    @keyframes ring-breathe {
        0%, 100% { box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.35); }
        50% { box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.65); }
    }

    @keyframes ring-pulse {
        0%, 100% { box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.3); }
        50% { box-shadow: inset 0 0 0 3px rgba(239, 68, 68, 0.9); }
    }
</style>
```

- [ ] **Step 3: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/Main/Camera.svelte src/lib/Main/UnifiCamera.svelte
git commit -m "feat: add clickDisabled prop to Camera, add UnifiCamera main component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Card routing + grid layout

**Files:**
- Modify: `src/lib/Main/Content.svelte` (add `unifi-camera` routing)
- Modify: `src/lib/Main/Index.svelte` (add `unifi-camera` to large items)

- [ ] **Step 1: Add import and routing in Content.svelte**

In `src/lib/Main/Content.svelte`:

Add import after Camera import (line 5):
```typescript
import UnifiCamera from '$lib/Main/UnifiCamera.svelte';
```

Add routing entry after the `camera` case (after line 38):
```svelte
{:else if item?.type === 'unifi-camera'}
    <UnifiCamera sel={item} responsive={false} muted={true} controls={false} />
```

- [ ] **Step 2: Add unifi-camera to large items in Index.svelte**

In `src/lib/Main/Index.svelte`, in the `itemStyles` function (line 200), add `unifi-camera` to the `large` array:

```typescript
function itemStyles(type: string) {
    const large = ['conditional_media', 'camera', 'unifi-camera', 'spotify_player_large', 'entities'];
    // ...rest unchanged
}
```

- [ ] **Step 3: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/Main/Content.svelte src/lib/Main/Index.svelte
git commit -m "feat: wire unifi-camera card type into Content router and grid

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: UnifiCamera config modal

**Files:**
- Create: `src/lib/Modal/UnifiCameraConfig.svelte`

**Interfaces:**
- Consumes: `UnifiCameraItem`, `discoverUnifiEntities` from Task 1

- [ ] **Step 1: Create UnifiCameraConfig.svelte**

Create `src/lib/Modal/UnifiCameraConfig.svelte`:

```svelte
<script lang="ts">
    import { states, dashboard, lang, ripple, entityList } from '$lib/Stores';
    import Select from '$lib/Components/Select.svelte';
    import ConfigModal from '$lib/Modal/ConfigModal.svelte';
    import Ripple from '$lib/Actions/ripple';
    import UnifiCamera from '$lib/Main/UnifiCamera.svelte';
    import { discoverUnifiEntities } from '$lib/Utils';
    import type { UnifiCameraItem } from '$lib/Types';

    let {
        isOpen,
        sel = $bindable(),
        demo = undefined
    }: {
        isOpen: boolean;
        sel: UnifiCameraItem;
        demo?: string | undefined;
    } = $props();

    let entity = $derived($states?.[sel?.entity_id]);

    let cameraOptions = $derived($entityList('camera'));

    let discovered = $derived(
        discoverUnifiEntities(sel?.entity_id, Object.keys($states ?? {}))
    );

    let motionOptions = $derived($entityList('binary_sensor'));
    let eventOptions = $derived($entityList('sensor'));

    function handleCameraChange(set: (key: string, event?: any) => void, entityId: string) {
        set('entity_id', entityId);
        // Auto-discover on camera selection
        const found = discoverUnifiEntities(entityId, Object.keys($states ?? {}));
        if (found.motion_sensor) set('motion_sensor', found.motion_sensor);
        if (found.doorbell_sensor) set('doorbell_sensor', found.doorbell_sensor);
        if (found.event_sensor) set('event_sensor', found.event_sensor);
    }

    function bool(val: any): boolean {
        if (val === 'true' || val === true) return true;
        if (val === 'false' || val === false) return false;
        return !!val;
    }
</script>

<ConfigModal {isOpen} bind:sel title="UniFi Protect Camera" {demo}>
    {#snippet children(set)}
        <h2>{$lang('preview')}</h2>
        <UnifiCamera {sel} responsive={true} muted={true} controls={false} />

        {#if cameraOptions}
            <h2>{$lang('entity')}</h2>
            <Select
                computeIcons={true}
                options={cameraOptions}
                placeholder="Camera entity"
                value={entity?.entity_id}
                onchange={(event: any) => handleCameraChange(set, event.detail || event)}
            />
        {/if}

        {#if discovered.motion_sensor || discovered.doorbell_sensor || discovered.event_sensor}
            <h2>Auto-discovered sensors</h2>
            <p class="discovered">
                {#if discovered.motion_sensor}
                    Motion: <code>{discovered.motion_sensor}</code>
                {/if}
                {#if discovered.doorbell_sensor}
                    Doorbell: <code>{discovered.doorbell_sensor}</code>
                {/if}
                {#if discovered.event_sensor}
                    Event: <code>{discovered.event_sensor}</code>
                {/if}
            </p>
        {/if}

        {#if motionOptions}
            <h2>Motion sensor</h2>
            <Select
                computeIcons={true}
                options={motionOptions}
                placeholder="binary_sensor.*_motion"
                value={sel?.motion_sensor || discovered.motion_sensor}
                onchange={(event: any) => set('motion_sensor', event.detail || event)}
            />
        {/if}

        {#if motionOptions}
            <h2>Doorbell sensor</h2>
            <Select
                computeIcons={true}
                options={motionOptions}
                placeholder="binary_sensor.*_doorbell"
                value={sel?.doorbell_sensor || discovered.doorbell_sensor}
                onchange={(event: any) => set('doorbell_sensor', event.detail || event)}
            />
        {/if}

        {#if eventOptions}
            <h2>Event sensor</h2>
            <Select
                computeIcons={true}
                options={eventOptions}
                placeholder="sensor.*_event"
                value={sel?.event_sensor || discovered.event_sensor}
                onchange={(event: any) => set('event_sensor', event.detail || event)}
            />
        {/if}

        <h2>{$lang('live')}</h2>
        <div class="button-container">
            <button class:selected={!bool(sel?.stream)} onclick={() => set('stream')} use:Ripple={$ripple}>
                {$lang('no')}
            </button>
            <button class:selected={bool(sel?.stream)} onclick={() => set('stream', true)} use:Ripple={$ripple}>
                {$lang('yes')}
            </button>
        </div>

        <h2>{$lang('size')}</h2>
        <div class="button-container">
            <button class:selected={!sel?.size} onclick={() => set('size')} use:Ripple={$ripple}>
                {$lang('fill')}
            </button>
            <button class:selected={sel?.size === 'contain'} onclick={() => set('size', 'contain')} use:Ripple={$ripple}>
                {$lang('aspect_ratio')}
            </button>
        </div>

        <h2>{$lang('overlay')}</h2>
        <div class="button-container">
            <button class:selected={sel?.hide_overlay !== true} onclick={() => set('hide_overlay')} use:Ripple={$ripple}>
                {$lang('visible')}
            </button>
            <button class:selected={sel?.hide_overlay === true} onclick={() => set('hide_overlay', true)} use:Ripple={$ripple}>
                {$lang('hidden')}
            </button>
        </div>

        {#if $dashboard?.sidebar?.find((item: any) => item?.id === sel?.id)}
            <h2>{$lang('mobile')}</h2>
            <div class="button-container">
                <button class:selected={sel?.hide_mobile !== true} onclick={() => set('hide_mobile')} use:Ripple={$ripple}>
                    {$lang('visible')}
                </button>
                <button class:selected={sel?.hide_mobile === true} onclick={() => set('hide_mobile', true)} use:Ripple={$ripple}>
                    {$lang('hidden')}
                </button>
            </div>
        {/if}
    {/snippet}
</ConfigModal>

<style>
    h2:first-letter { text-transform: uppercase; }
    .discovered {
        font-size: 0.85rem;
        color: var(--theme-button-state-color-off);
        padding: 0.5rem 0;
        line-height: 1.6;
    }
    .discovered code {
        background: rgba(255, 255, 255, 0.08);
        padding: 0.1rem 0.35rem;
        border-radius: 0.2rem;
        font-size: 0.8rem;
    }
</style>
```

- [ ] **Step 2: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/Modal/UnifiCameraConfig.svelte
git commit -m "feat: add UnifiCamera config modal with auto-discovery

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Translations

**Files:**
- Modify: `static/translations/en.json` (add new keys)
- Modify: `static/translations/zh.json` (add new keys)

- [ ] **Step 1: Add translation keys to en.json**

In `static/translations/en.json`, add before the final `}`:

```json
"unifi_camera": "UniFi Protect Camera",
"unifi_camera_description": "Enhanced camera card for UniFi Protect with motion detection, smart detection tags, adaptive event panel, and auto-discovery of related sensors.",
"motion_sensor": "Motion sensor",
"doorbell_sensor": "Doorbell sensor",
"event_sensor": "Event sensor",
"auto_discovered": "Auto-discovered sensors",
"offline": "Offline",
"online": "Online"
```

- [ ] **Step 2: Add translation keys to zh.json**

In `static/translations/zh.json`, add before the final `}`:

```json
"unifi_camera": "UniFi Protect 摄像头",
"unifi_camera_description": "增强型 UniFi Protect 摄像头卡片，支持运动检测、智能识别标签、自适应事件面板和相关传感器自动发现。",
"motion_sensor": "运动传感器",
"doorbell_sensor": "门铃传感器",
"event_sensor": "事件传感器",
"auto_discovered": "自动发现的传感器",
"offline": "离线",
"online": "在线"
```

- [ ] **Step 3: Verify JSON syntax**

```bash
node -e "JSON.parse(require('fs').readFileSync('static/translations/en.json','utf8')); console.log('en: OK')"
node -e "JSON.parse(require('fs').readFileSync('static/translations/zh.json','utf8')); console.log('zh: OK')"
```
Expected: `en: OK` and `zh: OK`

- [ ] **Step 4: Commit**

```bash
git add static/translations/en.json static/translations/zh.json
git commit -m "feat: add UniFi Protect camera translation keys (en + zh)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS with 0 errors

- [ ] **Step 2: Lint check**

Run: `npx eslint src/lib/Main/UnifiCamera.svelte src/lib/Main/UnifiCamera/Overlay.svelte src/lib/Main/UnifiCamera/EventPanel.svelte src/lib/Modal/UnifiCameraConfig.svelte`
Expected: PASS (fix any issues)

- [ ] **Step 3: Format**

Run: `npx prettier --check src/lib/Main/UnifiCamera.svelte src/lib/Main/UnifiCamera/Overlay.svelte src/lib/Main/UnifiCamera/EventPanel.svelte src/lib/Modal/UnifiCameraConfig.svelte`
Expected: PASS (run `npx prettier --write` if needed)

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: builds without errors

- [ ] **Step 5: Final commit (if any lint/format fixes)**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: lint and format fixes for UniFi camera

Co-Authored-By: Claude <noreply@anthropic.com>"
```
