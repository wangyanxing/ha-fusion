<script lang="ts">
	import { states, dashboard, lang, ripple, entityList } from '$lib/Stores';
	import Select from '$lib/Components/Select.svelte';
	import ConfigModal from '$lib/Modal/ConfigModal.svelte';
	import Ripple from '$lib/Actions/ripple';
	import UnifiCamera from '$lib/Main/UnifiCamera.svelte';
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
	let motionOptions = $derived($entityList('binary_sensor'));
	let sensorOptions = $derived($entityList('sensor'));
</script>

<ConfigModal {isOpen} bind:sel title="UniFi Protect Camera" {demo}>
	{#snippet children(set)}
		<h2>{$lang('preview')}</h2>

		<UnifiCamera {sel} responsive={true} muted={true} controls={false} />

		<!-- Camera entity -->
		{#if cameraOptions}
			<h2>{$lang('entity')}</h2>

			<Select
				computeIcons={true}
				options={cameraOptions}
				placeholder="camera.*"
				value={entity?.entity_id}
				onchange={(event: any) => set('entity_id', event?.detail || event)}
			/>
		{/if}

		<!-- Motion sensor -->
		{#if motionOptions}
			<h2>{$lang('motion_sensor') || 'Motion sensor'}</h2>
			<Select
				computeIcons={true}
				options={motionOptions}
				placeholder="binary_sensor.*_motion"
				value={sel?.motion_sensor}
				onchange={(event: any) => set('motion_sensor', event?.detail || event)}
			/>
		{/if}

		<!-- Doorbell sensor -->
		{#if motionOptions}
			<h2>{$lang('doorbell_sensor') || 'Doorbell sensor'}</h2>
			<Select
				computeIcons={true}
				options={motionOptions}
				placeholder="binary_sensor.*_doorbell"
				value={sel?.doorbell_sensor}
				onchange={(event: any) => set('doorbell_sensor', event?.detail || event)}
			/>
		{/if}

		<!-- Event sensor -->
		{#if sensorOptions}
			<h2>{$lang('event_sensor') || 'Event sensor'}</h2>
			<Select
				computeIcons={true}
				options={sensorOptions}
				placeholder="sensor.*_event"
				value={sel?.event_sensor}
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
</style>
