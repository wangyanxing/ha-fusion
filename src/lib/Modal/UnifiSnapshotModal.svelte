<script lang="ts">
	import Modal from '$lib/Modal/Index.svelte';
	import { getName } from '$lib/Utils';
	import { cameraStreamPaused } from '$lib/Stores';
	import Icon from '@iconify/svelte';
	import { onDestroy } from 'svelte';
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

	// Pause background camera streams while open so the snapshot request isn't
	// starved by MJPEG streams holding the browser's HTTP/1.1 connections.
	cameraStreamPaused.set(true);
	onDestroy(() => cameraStreamPaused.set(false));

	let entityPicture = $derived(entity?.attributes?.entity_picture || '');
	let broken = $state(false);
	let loaded = $state(false);

	let date = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => (date = Date.now()), 30000);
		return () => clearInterval(interval);
	});

	// UniFi Protect entity_picture may be a stream-like proxy URL whose <img>
	// onload never fires, which would leave the spinner up and the image hidden
	// forever. Reveal the image after a short delay as a fallback.
	$effect(() => {
		if (!entityPicture) return;
		const timeout = setTimeout(() => (loaded = true), 1500);
		return () => clearTimeout(timeout);
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
					src={`${entityPicture}${entityPicture.includes('?') ? '&' : '?'}ts=${date}`}
					onload={() => (loaded = true)}
					onerror={() => (broken = true)}
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
