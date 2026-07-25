<script lang="ts">
	import { lang, states, entityList, ripple } from '$lib/Stores';
	import Vacuum from '$lib/Main/Vacuum.svelte';
	import ConfigModal from '$lib/Modal/ConfigModal.svelte';
	import Select from '$lib/Components/Select.svelte';
	import InputClear from '$lib/Components/InputClear.svelte';
	import Ripple from '$lib/Actions/ripple';
	import { getName } from '$lib/Utils';

	let {
		isOpen,
		sel = $bindable(),
		sectionName = undefined
	}: {
		isOpen: boolean;
		sel: any;
		sectionName?: string;
	} = $props();

	let entity_id = $derived(sel?.entity_id);
	let name = $state(sel?.name);

	let options = $derived($entityList('vacuum'));
	// map can be an image or camera entity
	let mapOptions = $derived([...$entityList('image'), ...$entityList('camera')]);
</script>

<ConfigModal {isOpen} bind:sel title={$lang('vacuum') || 'Vacuum'}>
	{#snippet children(set)}
		<h2>{$lang('preview')}</h2>

		<div style:pointer-events="none">
			<Vacuum {sel} {sectionName} />
		</div>

		<h2>{$lang('layout') !== 'layout' ? $lang('layout') : 'Layout'}</h2>

		<div class="button-container">
			<button
				class:selected={sel?.layout !== 'compact'}
				onclick={() => set('layout', 'detailed')}
				use:Ripple={$ripple}
			>
				{$lang('map') || 'Map'}
			</button>
			<button
				class:selected={sel?.layout === 'compact'}
				onclick={() => set('layout', 'compact')}
				use:Ripple={$ripple}
			>
				{$lang('summary') || 'Summary'}
			</button>
		</div>

		<h2>{$lang('entity')}</h2>

		<Select
			{options}
			placeholder={$lang('entity')}
			value={entity_id}
			onchange={(event) => {
				if (event === null) return;
				set('entity_id', event);
			}}
			computeIcons={true}
		/>

		<h2>{$lang('name')}</h2>

		<InputClear
			condition={name}
			onclear={() => {
				name = undefined;
				set('name');
			}}
		>
			{#snippet children(padding)}
				<input
					name={$lang('name')}
					class="input"
					type="text"
					placeholder={getName(sel, (entity_id && $states[entity_id]) || undefined) ||
						$lang('name')}
					autocomplete="off"
					spellcheck="false"
					bind:value={name}
					onchange={(event) => set('name', event)}
					style:padding
				/>
			{/snippet}
		</InputClear>

		<h2>{$lang('map') !== 'map' ? $lang('map') : 'Map'}</h2>

		<Select
			options={mapOptions}
			placeholder={$lang('auto') || 'Auto'}
			value={sel?.map_entity}
			clearable={true}
			onchange={(event) => set('map_entity', event ?? undefined)}
			computeIcons={true}
		/>

		<h2>{$lang('battery') || 'Battery'}</h2>

		<div class="button-container">
			<button
				class:selected={!sel?.hide_battery}
				onclick={() => set('hide_battery')}
				use:Ripple={$ripple}
			>
				{$lang('visible') || 'Visible'}
			</button>
			<button
				class:selected={sel?.hide_battery}
				onclick={() => set('hide_battery', true)}
				use:Ripple={$ripple}
			>
				{$lang('hidden') || 'Hidden'}
			</button>
		</div>

		<h2>{$lang('show_more_info')}</h2>

		<div class="button-container">
			<button
				class:selected={sel?.more_info !== false}
				onclick={() => set('more_info')}
				use:Ripple={$ripple}
			>
				{$lang('yes')}
			</button>
			<button
				class:selected={sel?.more_info === false}
				onclick={() => set('more_info', false)}
				use:Ripple={$ripple}
			>
				{$lang('no')}
			</button>
		</div>
	{/snippet}
</ConfigModal>
