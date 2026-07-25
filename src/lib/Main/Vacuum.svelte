<script lang="ts">
	import {
		editMode,
		itemHeight,
		lang,
		ripple,
		states,
		connection,
		selectedLanguage
	} from '$lib/Stores';
	import { callService } from 'home-assistant-js-websocket';
	import { getName, getSupport, relativeTime } from '$lib/Utils';
	import { openModal } from '$lib/Modals';
	import Ripple from '$lib/Actions/ripple';
	import Icon from '@iconify/svelte';

	let { sel, sectionName = undefined }: { sel: any; sectionName?: string | undefined } = $props();

	let layout = $derived(sel?.layout === 'compact' ? 'compact' : 'detailed');

	let entity = $derived($states?.[sel?.entity_id]);
	let entity_id = $derived(entity?.entity_id);
	let attributes = $derived(entity?.attributes);
	let vacuumState = $derived(entity?.state);

	// vacuum supported_features uses the legacy SUPPORT_* bitmask (START=8192),
	// matching VacuumModal.svelte
	let supports = $derived(
		getSupport(attributes?.supported_features, {
			PAUSE: 4,
			STOP: 8,
			RETURN_HOME: 16,
			LOCATE: 512,
			START: 8192
		})
	);

	// map picture: use configured entity, else auto-detect an image/camera whose
	// id shares the vacuum's base name (e.g. vacuum.trump -> image.trump_map)
	let mapEntity = $derived.by(() => {
		if (sel?.map_entity) return $states?.[sel.map_entity];
		const base = sel?.entity_id?.split('.')?.[1];
		if (!base) return undefined;
		const match = Object.values($states ?? {}).find(
			(e: any) =>
				(e.entity_id.startsWith('image.') || e.entity_id.startsWith('camera.')) &&
				e.entity_id.includes(base)
		);
		return match;
	});
	let mapPicture = $derived(mapEntity?.attributes?.entity_picture);

	// battery: attributes.battery_level or a sibling sensor.<name>_battery
	let batteryEntity = $derived($states?.[sel?.entity_id?.replace('vacuum.', 'sensor.') + '_battery']);
	let batteryLevel = $derived(
		attributes?.battery_level ?? (batteryEntity ? Number(batteryEntity.state) : null)
	);
	let batteryIcon = $derived(
		batteryLevel == null
			? 'mdi:battery-unknown'
			: batteryLevel <= 10
				? 'mdi:battery-10'
				: batteryLevel <= 20
					? 'mdi:battery-20'
					: batteryLevel <= 50
						? 'mdi:battery-50'
						: batteryLevel <= 80
							? 'mdi:battery-80'
							: 'mdi:battery'
	);
	let batteryColor = $derived(
		batteryLevel == null
			? 'inherit'
			: batteryLevel <= 20
				? '#e53935'
				: batteryLevel <= 50
					? '#fb8c00'
					: '#43a047'
	);

	let statusText = $derived.by(() => {
		if (!vacuumState) return '';
		const translated = $lang(vacuumState);
		if (vacuumState === 'cleaning' && attributes?.cleaning_area) {
			return `${translated} - ${attributes.cleaning_area} m\u00B2`;
		}
		return translated;
	});

	// relative time since the vacuum last changed state (e.g. "13 hours ago")
	let lastChanged = $derived(
		entity?.last_changed ? relativeTime(entity.last_changed, $selectedLanguage) : ''
	);

	// robot icon accent color + breathing style per state.
	// `glow` is an rgb tri: reused by the CSS glow animation via --glow-color.
	let robotStyle = $derived.by(() => {
		switch (vacuumState) {
			case 'cleaning':
				return { color: '#43a047', glow: '67, 160, 71', anim: 'breathe-slow' }; // green, working
			case 'returning':
				return { color: '#fb8c00', glow: '251, 140, 0', anim: 'breathe-slow' }; // orange, heading home
			case 'docked':
			case 'charging':
				return { color: '#4ba6ed', glow: '75, 166, 237', anim: 'breathe' }; // blue, charging
			case 'paused':
				return { color: '#efbd07', glow: '239, 189, 7', anim: 'none' }; // yellow, paused
			case 'error':
				return { color: '#e53935', glow: '229, 57, 53', anim: 'breathe-fast' }; // red, alert
			default:
				return { color: 'var(--theme-button-name-color-off)', glow: '120, 170, 255', anim: 'none' };
		}
	});

	// start/pause is a single toggle button depending on current state
	let isCleaning = $derived(vacuumState === 'cleaning');

	function handleClick(service: string) {
		if ($editMode || !$connection) return;
		callService($connection, 'vacuum', service, { entity_id });
	}

	function handleStartPause() {
		handleClick(isCleaning ? 'pause' : 'start');
	}

	function handleCardClick() {
		if (!$editMode) return;
		openModal(() => import('$lib/Modal/VacuumConfig.svelte'), { sel, sectionName });
	}

	function openMoreInfo() {
		if ($editMode || sel?.more_info === false) return;
		openModal(() => import('$lib/Modal/VacuumModal.svelte'), { sel });
	}
</script>

{#snippet controls()}
	<div class="controls">
		{#if supports?.START || supports?.PAUSE}
			<button
				title={isCleaning ? $lang('pause') : $lang('start')}
				onclick={(event) => {
					event.stopPropagation();
					handleStartPause();
				}}
				use:Ripple={$ripple}
			>
				<Icon icon={isCleaning ? 'ic:round-pause' : 'ic:round-play-arrow'} height="none" />
			</button>
		{/if}

		{#if supports?.STOP}
			<button
				title={$lang('stop')}
				onclick={(event) => {
					event.stopPropagation();
					handleClick('stop');
				}}
				use:Ripple={$ripple}
			>
				<Icon icon="ic:round-stop" height="none" />
			</button>
		{/if}

		{#if supports?.RETURN_HOME}
			<button
				title={$lang('return_home')}
				onclick={(event) => {
					event.stopPropagation();
					handleClick('return_to_base');
				}}
				use:Ripple={$ripple}
			>
				<Icon icon="ic:round-home" height="none" />
			</button>
		{/if}

		{#if supports?.LOCATE}
			<button
				title={$lang('locate')}
				onclick={(event) => {
					event.stopPropagation();
					handleClick('locate');
				}}
				use:Ripple={$ripple}
			>
				<Icon icon="mdi:map-marker" height="none" />
			</button>
		{/if}
	</div>
{/snippet}

<div
	class="container"
	class:compact={layout === 'compact'}
	tabindex="-1"
	role="button"
	style:min-height="{$itemHeight}px"
	style:cursor={$editMode ? 'pointer' : 'default'}
	onclick={handleCardClick}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleCardClick();
		}
	}}
>
	{#if layout === 'compact'}
		<!-- compact layout: status + robot icon + controls + extras -->
		<div class="header">
			<span class="title">{getName(sel, entity)}</span>
			{#if !$editMode && sel?.more_info !== false}
				<button class="more" title={$lang('show_more_info')} onclick={openMoreInfo}>
					<Icon icon="mdi:dots-vertical" height="none" />
				</button>
			{/if}
		</div>

		<div class="summary">
			<div class="summary-state">{statusText}</div>
			<div class="summary-sub">
				<span class="last-changed">{lastChanged}</span>
				{#if batteryLevel != null && !sel?.hide_battery}
					<span class="battery" style:color={batteryColor}>
						{batteryLevel}%
						<span class="battery-icon"><Icon icon={batteryIcon} height="none" /></span>
					</span>
				{/if}
			</div>
		</div>

		<div
			class="robot"
			data-anim={robotStyle.anim}
			style:color={robotStyle.color}
			style:--glow-color={robotStyle.glow}
		>
			<Icon icon="mdi:robot-vacuum" height="none" />
		</div>

		{@render controls()}
	{:else}
		<!-- detailed layout: map -->
		<div class="header">
			<span class="title">{getName(sel, entity)}</span>
			<div class="header-right">
				{#if batteryLevel != null && !sel?.hide_battery}
					<span class="battery" style:color={batteryColor}>
						{batteryLevel}%
						<span class="battery-icon"><Icon icon={batteryIcon} height="none" /></span>
					</span>
				{/if}
				{#if !$editMode && sel?.more_info !== false}
					<button class="more" title={$lang('show_more_info')} onclick={openMoreInfo}>
						<Icon icon="mdi:dots-vertical" height="none" />
					</button>
				{/if}
			</div>
		</div>

		<div class="status">{statusText}</div>

		<div class="map">
			{#if mapPicture}
				<img src={mapPicture} alt={getName(sel, entity)} />
			{:else}
				<div class="map-placeholder">
					<Icon icon="mdi:robot-vacuum" height="none" />
				</div>
			{/if}
		</div>

		{@render controls()}
	{/if}
</div>

<style>
	.container {
		background-color: var(--theme-button-background-color-off);
		border-radius: 0.65rem;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 0.9rem 1rem 1rem;
		overflow: hidden;
		transform: translateZ(0);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		color: var(--theme-button-name-color-off);
		font-weight: 500;
		min-height: 1.5rem;
	}

	.title {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.battery {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.9rem;
		font-weight: 400;
	}

	.battery-icon {
		width: 1.2rem;
		height: 1.2rem;
		display: inline-flex;
	}

	.more {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0.15rem;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
	}

	.more:hover {
		opacity: 1;
	}

	.status {
		font-size: 0.95rem;
		opacity: 0.75;
		color: var(--theme-button-state-color-off);
		margin-top: 0.1rem;
	}

	.map {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0.75rem 0;
		min-height: 8rem;
		overflow: hidden;
	}

	.map img {
		max-width: 100%;
		max-height: 22rem;
		object-fit: contain;
		border-radius: 0.5rem;
	}

	.map-placeholder {
		width: 5rem;
		height: 5rem;
		opacity: 0.25;
		color: var(--theme-button-name-color-off);
	}

	.controls {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.controls button {
		flex: 1;
		max-width: 5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.8rem;
		border: none;
		border-radius: 0.55rem;
		background-color: rgba(0, 0, 0, 0.2);
		color: var(--theme-button-name-color-off);
		cursor: pointer;
	}

	.controls button:hover {
		background-color: rgba(255, 255, 255, 0.12);
	}

	.controls :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
	}

	/* ---------- compact layout ---------- */
	.container.compact {
		align-items: stretch;
	}

	.summary {
		text-align: center;
		margin-top: 0.5rem;
	}

	.summary-state {
		font-size: 2rem;
		font-weight: 300;
		line-height: 1.15;
		color: var(--theme-button-name-color-off);
	}

	.summary-sub {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		margin-top: 0.2rem;
		font-size: 0.9rem;
		opacity: 0.75;
		color: var(--theme-button-state-color-off);
	}

	.robot {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1.2rem 0 1.4rem;
	}

	.robot :global(svg) {
		width: 7rem;
		height: 7rem;
		opacity: 0.85;
		color: inherit;
		/* soft ambient glow tinted by the current state color */
		filter: drop-shadow(0 0 12px rgba(var(--glow-color, 120, 170, 255), 0.3));
	}

	/* per-state breathing (color + glow pulse together) */
	.robot[data-anim='breathe'] :global(svg) {
		animation: vacuum-breathe 2.8s ease-in-out infinite;
	}

	.robot[data-anim='breathe-slow'] :global(svg) {
		animation: vacuum-breathe 3.6s ease-in-out infinite;
	}

	.robot[data-anim='breathe-fast'] :global(svg) {
		animation: vacuum-breathe 1.4s ease-in-out infinite;
	}

	@keyframes vacuum-breathe {
		0%,
		100% {
			opacity: 0.4;
			filter: drop-shadow(0 0 8px rgba(var(--glow-color), 0.15));
		}
		50% {
			opacity: 0.9;
			filter: drop-shadow(0 0 20px rgba(var(--glow-color), 0.5));
		}
	}
</style>
