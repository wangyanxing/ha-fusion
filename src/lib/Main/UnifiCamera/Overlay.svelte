<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getName } from '$lib/Utils';
	import type { HassEntity } from 'home-assistant-js-websocket';

	let {
		isOnline,
		entity,
		detectionTags = []
	}: {
		isOnline: boolean;
		entity: HassEntity | undefined;
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
	.status-dot.online {
		background: #4ade80;
	}
	.status-dot.offline {
		background: #6b7280;
	}

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
