<script lang="ts">
	import { lang, states, entityList } from '$lib/Stores';
	import Thermostat from '$lib/Main/Thermostat.svelte';
	import ConfigModal from '$lib/Modal/ConfigModal.svelte';
	import Select from '$lib/Components/Select.svelte';
	import InputClear from '$lib/Components/InputClear.svelte';
	import Ripple from '$lib/Actions/ripple';
	import { ripple } from '$lib/Stores';
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

	let options = $derived($entityList('climate'));
</script>

<ConfigModal {isOpen} bind:sel title={$lang('thermostat') || 'Thermostat'}>
	{#snippet children(set)}
		<h2>{$lang('preview')}</h2>

		<div style:pointer-events="none">
			<Thermostat {sel} {sectionName} />
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
