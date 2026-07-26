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

	let entity = $derived(sel?.entity_id ? $states?.[sel.entity_id] : undefined);

	let cameraOptions = $derived($entityList('camera'));

	let discovered = $derived(
		discoverUnifiEntities(sel?.entity_id, Object.keys($states ?? {}))
	);

	let motionOptions = $derived($entityList('binary_sensor'));
	let eventOptions = $derived($entityList('sensor'));

	function handleCameraChange(
		set: (key: string, event?: any) => void,
		entityId: string | undefined
	) {
		set('entity_id', entityId);
		// Auto-discover on camera selection
		const found = discoverUnifiEntities(entityId, Object.keys($states ?? {}));
		if (found.motion_sensor) set('motion_sensor', found.motion_sensor);
		if (found.doorbell_sensor) set('doorbell_sensor', found.doorbell_sensor);
		if (found.event_sensor) set('event_sensor', found.event_sensor);
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
				onchange={(event: any) => handleCameraChange(set, event?.detail || event)}
			/>
		{/if}

		{#if discovered.motion_sensor || discovered.doorbell_sensor || discovered.event_sensor}
			<h2>Auto-discovered sensors</h2>
			<p class="discovered">
				{#if discovered.motion_sensor}
					Motion: <code>{discovered.motion_sensor}</code>
				{/if}
				{#if discovered.doorbell_sensor}
					<br />Doorbell: <code>{discovered.doorbell_sensor}</code>
				{/if}
				{#if discovered.event_sensor}
					<br />Event: <code>{discovered.event_sensor}</code>
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
				onchange={(event: any) => set('motion_sensor', event?.detail || event)}
			/>
		{/if}

		{#if motionOptions}
			<h2>Doorbell sensor</h2>
			<Select
				computeIcons={true}
				options={motionOptions}
				placeholder="binary_sensor.*_doorbell"
				value={sel?.doorbell_sensor || discovered.doorbell_sensor}
				onchange={(event: any) => set('doorbell_sensor', event?.detail || event)}
			/>
		{/if}

		{#if eventOptions}
			<h2>Event sensor</h2>
			<Select
				computeIcons={true}
				options={eventOptions}
				placeholder="sensor.*_event"
				value={sel?.event_sensor || discovered.event_sensor}
				onchange={(event: any) => set('event_sensor', event?.detail || event)}
			/>
		{/if}

		<h2>{$lang('live')}</h2>
		<div class="button-container">
			<button
				class:selected={!sel?.stream}
				onclick={() => set('stream')}
				use:Ripple={$ripple}
			>
				{$lang('no')}
			</button>
			<button
				class:selected={sel?.stream === true}
				onclick={() => set('stream', true)}
				use:Ripple={$ripple}
			>
				{$lang('yes')}
			</button>
		</div>

		<h2>{$lang('size')}</h2>
		<div class="button-container">
			<button class:selected={!sel?.size} onclick={() => set('size')} use:Ripple={$ripple}>
				{$lang('fill')}
			</button>
			<button
				class:selected={sel?.size === 'contain'}
				onclick={() => set('size', 'contain')}
				use:Ripple={$ripple}
			>
				{$lang('aspect_ratio')}
			</button>
		</div>

		<h2>{$lang('overlay')}</h2>
		<div class="button-container">
			<button
				class:selected={sel?.hide_overlay !== true}
				onclick={() => set('hide_overlay')}
				use:Ripple={$ripple}
			>
				{$lang('visible')}
			</button>
			<button
				class:selected={sel?.hide_overlay === true}
				onclick={() => set('hide_overlay', true)}
				use:Ripple={$ripple}
			>
				{$lang('hidden')}
			</button>
		</div>

		<!-- only show if it's a sidebar item -->
		{#if $dashboard?.sidebar?.find((item) => item?.id === sel?.id)}
			<h2>{$lang('mobile')}</h2>
			<div class="button-container">
				<button
					class:selected={sel?.hide_mobile !== true}
					onclick={() => set('hide_mobile')}
					use:Ripple={$ripple}
				>
					{$lang('visible')}
				</button>
				<button
					class:selected={sel?.hide_mobile === true}
					onclick={() => set('hide_mobile', true)}
					use:Ripple={$ripple}
				>
					{$lang('hidden')}
				</button>
			</div>
		{/if}
	{/snippet}
</ConfigModal>

<style>
	h2:first-letter {
		text-transform: uppercase;
	}

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
