<script lang="ts">
	import Modal from '$lib/Modal/Index.svelte';
	import { getName } from '$lib/Utils';
	import Icon from '@iconify/svelte';
	import type { HassEntity } from 'home-assistant-js-websocket';

	let {
		isOpen,
		sel,
		entity
	}: {
		isOpen: boolean;
		sel: any;
		entity: HassEntity | undefined;
	} = $props();

	console.log('[UnifiSnapshot] OPENED — entity_id:', sel?.entity_id);
	console.log('[UnifiSnapshot] entity:', entity?.state, entity?.attributes?.entity_picture);
	console.log('[UnifiSnapshot] frontend_stream_type:', entity?.attributes?.frontend_stream_type);

	let entityPicture = $derived(entity?.attributes?.entity_picture || '');
	let broken = $state(false);
	let loaded = $state(false);

	let date = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => (date = Date.now()), 30000);
		return () => clearInterval(interval);
	});
</script>

{#if isOpen}
	<Modal size="large">
		{#snippet title()}<h1>{getName(sel, entity)}</h1>{/snippet}

		<div class="viewer">
			{#if !loaded && !broken}
				<div class="loader">
					<Icon icon="svg-spinners:3-dots-scale" width="2rem" height="auto" />
				</div>
			{/if}

			{#if broken}
				<div class="broken">
					<Icon icon="ph:image-broken-duotone" width="3rem" height="auto" />
				</div>
			{:else if entityPicture}
				<img
					src={`${entityPicture}${date ? '&ts=' + date : ''}`}
					onload={() => {
						console.log('[UnifiSnapshot] IMG ONLOAD');
						loaded = true;
					}}
					onerror={(e) => {
						console.log('[UnifiSnapshot] IMG ONERROR', e);
						broken = true;
					}}
					style:display={loaded ? 'block' : 'none'}
					alt=""
				/>
			{:else}
				<div class="broken">
					<Icon icon="ph:image-broken-duotone" width="3rem" height="auto" />
				</div>
			{/if}
		</div>
	</Modal>
{/if}

<style>
	.viewer {
		position: relative;
		margin-top: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 0.6rem;
		overflow: hidden;
	}

	img {
		width: 100%;
		max-height: 80vh;
		object-fit: contain;
	}

	.loader,
	.broken {
		position: absolute;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
