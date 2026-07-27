<script lang="ts">
	import Camera from '$lib/Main/Camera.svelte';
	import { editMode, states } from '$lib/Stores';
	import { openModal } from '$lib/Modals';
	import Overlay from '$lib/Main/UnifiCamera/Overlay.svelte';
	import EventPanel from '$lib/Main/UnifiCamera/EventPanel.svelte';
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
	let isOnline = $derived(entity?.state !== 'unavailable' && entity?.state !== 'unknown');

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

		return types.map((t) => ({
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
			// Force stream off in full-screen — proxy image loads instantly
			openModal(() => import('$lib/Modal/CameraModal.svelte'), {
				sel: { ...sel, stream: false }
			});
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

	<!-- Overlay: always visible (idle state), with status dot + name + detection tags -->
	{#if muted && !responsive}
		<Overlay {isOnline} {entity} {detectionTags} />
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
		0%,
		100% {
			box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.35);
		}
		50% {
			box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.65);
		}
	}

	@keyframes ring-pulse {
		0%,
		100% {
			box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.3);
		}
		50% {
			box-shadow: inset 0 0 0 3px rgba(239, 68, 68, 0.9);
		}
	}
</style>
