<script lang="ts">
	import type { KonvaViewer } from '$lib/Modal/PictureElements/konvaViewer';
	import { onDestroy, onMount, tick } from 'svelte';
	import { dashboard, editMode } from '$lib/Stores';
	import { openModal } from '$lib/Modals';
	import type { Dashboard } from '$lib/Types';
	import { loadIcons } from '@iconify/svelte';
	import { icons } from '$lib/Modal/PictureElements/icons';

	let { sel }: { sel: any } = $props();

	let konva: KonvaViewer;
	let canvas: HTMLDivElement;
	let resizeObserver: ResizeObserver | undefined;

	/**
	 * Setup konva by importing it on
	 * mount because of ssr and canvas
	 */
	onMount(async () => {
		if (konva) return;

		const { KonvaViewer } = await import('$lib/Modal/PictureElements/konvaViewer');

		if (canvas) {
			konva = new KonvaViewer(canvas, {
				className: 'Stage',
				attrs: {
					width: canvas?.offsetWidth,
					height: canvas?.offsetHeight,
					id: sel?.id?.toString()
				},
				children: [
					{
						className: 'Layer',
						children: sel?.elements || []
					}
				]
			});

			// keep the stage sized to the container and refit content
			resizeObserver = new ResizeObserver(() => {
				if (!konva || !canvas) return;
				konva.stage.width(canvas.offsetWidth);
				konva.stage.height(canvas.offsetHeight);
				konva.fitContent();
			});
			resizeObserver.observe(canvas);
		}
	});

	/**
	 * Update konva on dashboard change
	 * without tearing it down (no compare)
	 */
	$effect(() => {
		updateKonva($dashboard);
	});

	async function updateKonva($dashboard: Dashboard) {
		if (!konva || !canvas || !$dashboard) return;
		await tick();
		const elements = sel?.elements || [];
		await konva.updateLayerChildren(elements);
	}

	/**
	 * Handle $editMode click to open
	 * picture elements config modal
	 */
	async function handleClick() {
		if (!$editMode) return;

		// import in parallel
		const [PictureElementsConfig] = await Promise.all([
			import('$lib/Modal/PictureElements/PictureElementsConfig.svelte'),
			loadIcons(Object.values(icons))
		]);

		// open modal
		openModal(PictureElementsConfig.default, {
			sel
		});
	}

	/**
	 * Konva cleanup on destroy
	 */
	onDestroy(() => {
		resizeObserver?.disconnect();
		if (konva) konva.destroyViewer();
	});
</script>

<div
	onclick={handleClick}
	bind:this={canvas}
	data-picture-elements
	style:cursor={$editMode ? 'unset' : 'default'}
	style:background-color={!sel?.elements?.length
		? 'var(--theme-button-background-color-off)'
		: 'transparent'}
></div>

<style>
	div {
		width: 100%;
		aspect-ratio: 2824 / 2228;
		border-radius: 0.6rem;
		overflow: hidden;
	}
</style>
