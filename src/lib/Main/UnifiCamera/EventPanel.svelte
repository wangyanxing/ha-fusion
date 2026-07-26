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
	let eventType = $derived(
		eventEntity?.attributes?.event_type ?? eventEntity?.attributes?.event_object ?? ''
	);

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
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
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
