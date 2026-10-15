<script lang="ts">
	import { timer, selectedLanguage } from '$lib/Stores';
	import { onMount } from 'svelte';

	let {
		hour12 = undefined,
		seconds = undefined
	}: {
		hour12?: boolean | undefined;
		seconds?: boolean | undefined;
	} = $props();

	let timeParts = $derived(
		new Intl.DateTimeFormat($selectedLanguage, {
			hour: hour12 ? 'numeric' : '2-digit',
			minute: '2-digit',
			second: seconds ? '2-digit' : undefined,
			hour12: hour12
		}).formatToParts($timer)
	);

	let container: HTMLDivElement;
	let measurement: HTMLSpanElement;
	let fontSize = $state<string>();

	onMount(() => {
		function fitTime() {
			const style = getComputedStyle(container);
			const available =
				container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			const width = measurement.getBoundingClientRect().width;
			if (available <= 0 || width === 0) return;
			const baseSize = parseFloat(getComputedStyle(measurement).fontSize);
			fontSize = `${baseSize * Math.min(1, available / width)}px`;
		}

		const observer = new ResizeObserver(fitTime);
		observer.observe(container);
		observer.observe(measurement);
		fitTime();
		return () => observer.disconnect();
	});
</script>

<div bind:this={container} style:font-size={fontSize}>
	<span>
		{#each timeParts as part, index (index)}
			<span class:day-period={part.type === 'dayPeriod'}>{part.value}</span>
		{/each}
	</span>
	<span bind:this={measurement} class="measurement" aria-hidden="true">
		{#each timeParts as part, index (index)}
			<span class:day-period={part.type === 'dayPeriod'}>{part.value}</span>
		{/each}
	</span>
</div>

<style>
	div {
		position: relative;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: var(--theme-sidebar-item-padding);
		font-weight: 500;
		line-height: 2.8rem;
		font-size: var(--theme-sizes-sidebar-time);
		text-shadow: 0px 0px 5px rgba(0, 0, 0, 0.1);
		white-space: nowrap;
		overflow: hidden;
		margin-left: -0.1rem;
	}

	.day-period {
		font-size: 0.5em;
	}

	.measurement {
		position: absolute;
		visibility: hidden;
		width: max-content;
		font-size: var(--theme-sizes-sidebar-time);
		pointer-events: none;
	}
</style>
