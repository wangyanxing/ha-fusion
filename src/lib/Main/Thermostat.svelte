<script lang="ts">
	import { editMode, itemHeight, lang, ripple, states, connection } from '$lib/Stores';
	import { callService } from 'home-assistant-js-websocket';
	import { getName, getSupport } from '$lib/Utils';
	import { openModal } from '$lib/Modals';
	import Ripple from '$lib/Actions/ripple';
	import Icon from '@iconify/svelte';

	let { sel, sectionName = undefined }: { sel: any; sectionName?: string | undefined } = $props();

	let entity = $derived($states?.[sel?.entity_id]);
	let entity_id = $derived(entity?.entity_id);
	let attributes = $derived(entity?.attributes);
	let hvacState = $derived(entity?.state);

	let supports = $derived(
		getSupport(attributes?.supported_features, {
			TARGET_TEMPERATURE: 1,
			TARGET_TEMPERATURE_RANGE: 2
		})
	);

	// dial geometry (open arc with a gap at the bottom, like HA's thermostat)
	const CX = 50;
	const CY = 50;
	const R = 40;
	const STROKE = 7;
	const START = 135;
	const SWEEP = 270;

	let min = $derived(Number(attributes?.min_temp ?? 7));
	let max = $derived(Number(attributes?.max_temp ?? 35));
	let step = $derived(Number(attributes?.target_temp_step ?? 0.5));

	// hvac mode -> icon
	const hvacModeIcons: Record<string, string> = {
		off: 'mdi:power',
		heat: 'mdi:fire',
		cool: 'mdi:snowflake',
		heat_cool: 'mdi:sun-snowflake-variant',
		auto: 'mdi:thermostat-auto',
		dry: 'mdi:water-percent',
		fan_only: 'mdi:fan'
	};

	// bright accent driven by the current mode (not hvac_action), so cooling
	// stays blue even when the compressor is idle
	const modeColors: Record<string, string> = {
		off: '#8a8a8a',
		heat: '#ff8100',
		cool: '#2b9af9',
		heat_cool: '#ff8100',
		auto: '#43a047',
		dry: '#efbd07',
		fan_only: '#2b9af9'
	};

	let accent = $derived(hvacState === 'off' ? '#5a5a5a' : modeColors[hvacState] || '#3b9eff');

	// darkens a hex color by `amount` (0-1) for the gradient's far end / current dot
	function darken(hex: string, amount: number) {
		const m = hex.replace('#', '');
		const n = parseInt(
			m.length === 3
				? m
						.split('')
						.map((c) => c + c)
						.join('')
				: m,
			16
		);
		const r = Math.round(((n >> 16) & 255) * (1 - amount));
		const g = Math.round(((n >> 8) & 255) * (1 - amount));
		const b = Math.round((n & 255) * (1 - amount));
		return `rgb(${r}, ${g}, ${b})`;
	}

	let accentDark = $derived(darken(accent, 0.55));

	// while dragging show the pending value for responsiveness
	let dragging = $state(false);
	let dragTemp = $state<number | undefined>();

	let target = $derived(
		dragging && dragTemp !== undefined ? dragTemp : Number(attributes?.temperature)
	);

	let hasSingleTarget = $derived(supports?.TARGET_TEMPERATURE && attributes?.temperature != null);

	let fraction = $derived(
		hasSingleTarget && max > min ? Math.min(Math.max((target - min) / (max - min), 0), 1) : 0
	);

	function polar(deg: number) {
		const rad = (deg * Math.PI) / 180;
		return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
	}

	function arcPath(startDeg: number, endDeg: number) {
		const s = polar(startDeg);
		const e = polar(endDeg);
		const large = endDeg - startDeg > 180 ? 1 : 0;
		return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
	}

	let trackPath = $derived(arcPath(START, START + SWEEP));
	// blue fill runs from the handle clockwise to the right-bottom end (ecobee style)
	let progressPath = $derived(arcPath(START + fraction * SWEEP, START + SWEEP));
	let handle = $derived(polar(START + fraction * SWEEP));

	// small dot marking the current room temperature on the ring
	let currentTemp = $derived(Number(attributes?.current_temperature));
	let hasCurrentDot = $derived(
		attributes?.current_temperature != null && !Number.isNaN(currentTemp) && max > min
	);
	let currentFraction = $derived(
		hasCurrentDot ? Math.min(Math.max((currentTemp - min) / (max - min), 0), 1) : 0
	);
	let currentDot = $derived(polar(START + currentFraction * SWEEP));

	function snap(value: number) {
		const snapped = Math.round(value / step) * step;
		const clamped = Math.min(Math.max(snapped, min), max);
		// avoid float noise like 20.500000001
		return Math.round(clamped * 100) / 100;
	}

	let svgEl = $state<SVGSVGElement>();

	function tempFromPointer(event: PointerEvent): number | undefined {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		let a = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
		if (a < 0) a += 360;
		// shift into the [START, START + SWEEP] domain
		if (a < START) a += 360;
		let frac: number;
		if (a > START + SWEEP) {
			// pointer is in the bottom gap: clamp to the nearest end
			frac = a - (START + SWEEP) < 360 - (a - START) ? 1 : 0;
		} else {
			frac = (a - START) / SWEEP;
		}
		return snap(min + frac * (max - min));
	}

	function onPointerDown(event: PointerEvent) {
		if ($editMode || !hasSingleTarget || hvacState === 'off') return;
		event.preventDefault();
		dragging = true;
		dragTemp = tempFromPointer(event);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		dragTemp = tempFromPointer(event);
	}

	function onPointerUp() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		if (dragging && dragTemp !== undefined && $connection) {
			callService($connection, 'climate', 'set_temperature', {
				entity_id,
				temperature: dragTemp
			});
		}
		dragging = false;
	}

	function setMode(mode: string) {
		if ($editMode || !$connection) return;
		callService($connection, 'climate', 'set_hvac_mode', { entity_id, hvac_mode: mode });
	}

	function handleCardClick() {
		if (!$editMode) return;
		openModal(() => import('$lib/Modal/ThermostatConfig.svelte'), { sel, sectionName });
	}

	function openMoreInfo() {
		if ($editMode || sel?.more_info === false) return;
		openModal(() => import('$lib/Modal/ClimateModal.svelte'), { sel });
	}

	function formatTemp(value: number | undefined) {
		if (value == null || Number.isNaN(value)) return '–';
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}

	// splits a temperature into integer and decimal parts so the fraction
	// can be rendered small next to the large integer (like HA's card)
	function splitTemp(value: number | undefined) {
		if (value == null || Number.isNaN(value)) return { int: '–', frac: '' };
		const rounded = Math.round(value * 10) / 10;
		const int = Math.trunc(rounded);
		const decimal = Math.round(Math.abs(rounded - int) * 10);
		return { int: String(int), frac: decimal ? `.${decimal}` : '' };
	}
</script>

<div
	class="container"
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
	<div class="header">
		<span class="title">{getName(sel, entity)}</span>
		{#if !$editMode && sel?.more_info !== false}
			<button class="more" title={$lang('show_more_info')} onclick={openMoreInfo}>
				<Icon icon="mdi:dots-vertical" height="none" />
			</button>
		{/if}
	</div>

	<div class="dial">
		<svg bind:this={svgEl} viewBox="0 0 100 100" onpointerdown={onPointerDown}>
			<path class="track" d={trackPath} stroke-width={STROKE} />
			{#if hasSingleTarget && hvacState !== 'off'}
				<path
					class="progress"
					d={progressPath}
					stroke-width={STROKE}
					style:stroke={accent}
				/>
				<circle class="handle" cx={handle.x} cy={handle.y} r={STROKE / 1.7} />
			{/if}
			{#if hasCurrentDot && hvacState !== 'off'}
				<circle
					class="current-dot"
					cx={currentDot.x}
					cy={currentDot.y}
					r={STROKE / 3.2}
					style:fill={accentDark}
				/>
			{/if}
		</svg>

		<div class="center">
			{#if attributes?.hvac_action}
				<div class="action" style:color={hvacState === 'off' ? undefined : accent}>
					{$lang(attributes.hvac_action)}
				</div>
			{/if}

			{#if hvacState === 'off'}
				<div class="target">{$lang('off')}</div>
			{:else if hasSingleTarget}
				<div
					class="target glow"
					style:color={accent}
					style:text-shadow="0 0 40px {accent}"
				>
					<span class="int">{splitTemp(target).int}</span>
					<span class="frac">
						<span class="unit">{attributes?.temperature_unit || '°C'}</span>
						{#if splitTemp(target).frac}
							<span class="dec">{splitTemp(target).frac}</span>
						{/if}
					</span>
				</div>
			{:else if supports?.TARGET_TEMPERATURE_RANGE}
				<div class="target range">
					{formatTemp(Number(attributes?.target_temp_low))}<span class="deg">°</span>
					<span class="sep">–</span>
					{formatTemp(Number(attributes?.target_temp_high))}<span class="deg">°</span>
				</div>
			{:else}
				<div class="target">{$lang(hvacState) || hvacState}</div>
			{/if}

			{#if attributes?.current_temperature != null}
				<div class="current" style:color={hvacState === 'off' ? undefined : accent}>
					<Icon icon="mdi:thermometer" height="none" />
					{attributes.current_temperature}&nbsp;{attributes?.temperature_unit || '°C'}
				</div>
			{/if}
		</div>
	</div>

	{#if attributes?.hvac_modes?.length}
		<div class="modes">
			{#each attributes.hvac_modes as mode (mode)}
				{@const active = mode === hvacState}
				<button
					title={$lang(mode)}
					class:selected={active}
					style:background-color={active ? modeColors[mode] || '#2b9af9' : undefined}
					style:color={active ? 'white' : undefined}
					onclick={(event) => {
						event.stopPropagation();
						setMode(mode);
					}}
					use:Ripple={$ripple}
				>
					<Icon icon={hvacModeIcons[mode] || 'mdi:thermostat'} height="none" />
				</button>
			{/each}
		</div>
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
		justify-content: center;
		position: relative;
		color: var(--theme-button-name-color-off);
		font-weight: 500;
		min-height: 1.5rem;
	}

	.title {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.more {
		position: absolute;
		right: 0;
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

	.dial {
		position: relative;
		flex: 1;
		display: grid;
		place-items: center;
		margin: 0.5rem 0;
		min-height: 12rem;
	}

	svg {
		width: 100%;
		max-width: 18rem;
		height: auto;
		touch-action: none;
	}

	.track {
		fill: none;
		stroke: rgba(255, 255, 255, 0.08);
		stroke-linecap: round;
	}

	.progress {
		fill: none;
		stroke-linecap: round;
	}

	.handle {
		fill: white;
		stroke: rgba(0, 0, 0, 0.25);
		stroke-width: 0.5;
		filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
	}

	/* current room temperature marker (solid dot on the ring) */
	.current-dot {
		stroke: none;
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		text-align: center;
		gap: 0.15rem;
	}

	.action {
		font-size: 0.95rem;
		opacity: 0.7;
		color: var(--theme-button-state-color-off);
	}

	.target {
		font-size: 2.8rem;
		font-weight: 300;
		line-height: 1.1;
		color: var(--theme-button-name-color-off);
		display: inline-flex;
		align-items: flex-start;
		justify-content: center;
	}

	.target .int {
		font-size: 3.6rem;
		font-weight: 300;
		line-height: 1;
	}

	.target .frac {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		margin-top: 0.35rem;
		margin-left: 0.15rem;
		line-height: 1.1;
	}

	.target .unit {
		font-size: 1.05rem;
		font-weight: 400;
	}

	.target .dec {
		font-size: 1.3rem;
		font-weight: 300;
	}

	.target.range {
		font-size: 1.9rem;
		align-items: baseline;
	}

	.target .deg {
		font-size: 0.6em;
		vertical-align: top;
	}

	.target .sep {
		opacity: 0.5;
		margin: 0 0.15rem;
	}

	.current {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.95rem;
		opacity: 0.8;
		color: var(--theme-button-state-color-off);
	}

	.current :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.modes {
		display: flex;
		gap: 0.5rem;
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 0.55rem;
		padding: 0.35rem;
	}

	.modes button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.4rem;
		padding: 0.5rem;
		border: none;
		border-radius: 0.4rem;
		background: none;
		color: var(--theme-button-state-color-off);
		cursor: pointer;
		opacity: 0.6;
	}

	.modes button.selected {
		background-color: rgba(255, 255, 255, 0.15);
		color: var(--theme-button-name-color-off);
		opacity: 1;
	}

	.modes :global(svg) {
		width: 1.4rem;
		height: 1.4rem;
	}
</style>
