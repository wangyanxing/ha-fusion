<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import { editMode } from '$lib/Stores';

	type Photo = { id: string; fileName: string };

	let frame = $state<HTMLElement>();
	let name = $state('家庭相册');
	let photos = $state<Photo[]>([]);
	let index = $state(0);
	let loading = $state(true);
	let loaded = $state(false);
	let paused = $state(false);
	let visible = $state(true);
	let fullscreen = $state(false);
	let fullscreenAvailable = $state(false);
	let message = $state('');
	let failedCount = $state(0);
	let fullscreenError = $state('');
	let controller: AbortController | undefined;
	let current = $derived(photos[index]);
	let controlsVisible = $state(false);
	let controlsTimer: ReturnType<typeof setTimeout> | undefined;
	let pagination = $derived.by(() => {
		const start = Math.max(0, Math.min(index - 1, photos.length - 3));
		return Array.from({ length: Math.min(3, photos.length) }, (_, offset) => start + offset);
	});

	function revealControls() {
		controlsVisible = true;
		clearTimeout(controlsTimer);
		controlsTimer = setTimeout(() => (controlsVisible = false), 3000);
	}

	function selectPhoto(target: number) {
		if (target === index) return;
		loaded = false;
		index = target;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.target !== frame) return;
		if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
			event.preventDefault();
			revealControls();
			if (event.key === ' ') paused = !paused;
			else move(event.key === 'ArrowLeft' ? -1 : 1);
		}
	}

	function shuffle(items: Photo[], previousId?: string) {
		const result = [...items];
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[result[i], result[j]] = [result[j], result[i]];
		}
		if (result.length > 1 && result[0].id === previousId) {
			[result[0], result[1]] = [result[1], result[0]];
		}
		return result;
	}

	async function loadAlbum() {
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		loaded = false;
		message = '';
		photos = [];
		failedCount = 0;
		index = 0;
		const timeout = setTimeout(() => request.abort(), 30000);
		try {
			const response = await fetch(`${base}/_api/immich/album`, {
				signal: request.signal,
				cache: 'no-store'
			});
			const data = await response.json();
			if (controller !== request) return;
			if (!response.ok) throw new Error(data.message || '无法读取相册，请检查 Immich 配置。');
			name = data.name || '家庭相册';
			photos = shuffle(data.assets);
			if (!photos.length) message = '这个相册暂时没有可展示的照片，视频不会参与轮播。';
		} catch (error) {
			if (controller !== request) return;
			message = request.signal.aborted
				? '读取相册超时，请检查 Immich 是否可连接后重试。'
				: error instanceof Error
					? error.message
					: '无法连接 Immich，请检查网络后重试。';
		} finally {
			clearTimeout(timeout);
			if (controller === request) loading = false;
		}
	}

	function move(direction: number) {
		if (photos.length < 2) return;
		loaded = false;
		if (direction > 0 && index === photos.length - 1) {
			photos = shuffle(photos, current?.id);
			index = 0;
		} else {
			index = (index + direction + photos.length) % photos.length;
		}
	}

	function skipFailed(id: string) {
		if (current?.id !== id) return;
		loaded = false;
		failedCount += 1;
		photos = photos.filter((photo) => photo.id !== id);
		index = Math.min(index, Math.max(0, photos.length - 1));
		if (!photos.length) message = '相册照片均加载失败，请检查 Immich 连接和密钥权限后重试。';
	}

	async function toggleFullscreen() {
		fullscreenError = '';
		try {
			if (document.fullscreenElement === frame) await document.exitFullscreen();
			else await frame?.requestFullscreen();
		} catch {
			fullscreenError = '浏览器未允许全屏，请检查浏览器或嵌入页面的权限。';
		}
	}

	onMount(() => {
		visible = !document.hidden;
		fullscreenAvailable = Boolean(document.fullscreenEnabled);
		void loadAlbum();
		return () => {
			clearTimeout(controlsTimer);
			controller?.abort();
			controller = undefined;
		};
	});

	$effect(() => {
		if (loading || !loaded || paused || !visible || $editMode || photos.length < 2) return;
		const timer = setTimeout(() => move(1), 30000);
		return () => clearTimeout(timer);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:document
	onvisibilitychange={() => (visible = !document.hidden)}
	onfullscreenchange={() => (fullscreen = document.fullscreenElement === frame)}
/>

<section
	class="album"
	class:controls-visible={controlsVisible}
	data-immich-album
	bind:this={frame}
	aria-roledescription="轮播"
	aria-label={name}
	tabindex="0"
	onpointermove={revealControls}
	onpointerdown={revealControls}
	onpointerleave={(event) => {
		if (event.pointerType === 'mouse') controlsVisible = false;
	}}
>
	<div class="stage" aria-busy={loading || Boolean(current && !loaded)}>
		{#if loading}
			<div class="notice" role="status">
				<Icon icon="mdi:image-outline" width="32" aria-hidden="true" />
				<p>正在读取相册…</p>
			</div>
		{:else if current}
			{#key current.id}
				{@const photo = current}
				<img
					class:ready={loaded}
					src={`${base}/_api/immich/assets/${encodeURIComponent(photo.id)}`}
					alt={photo.fileName || '相册照片'}
					draggable="false"
					onload={() => {
						if (current?.id === photo.id) loaded = true;
					}}
					onerror={() => skipFailed(photo.id)}
				/>
			{/key}
			{#if !loaded}<span class="photo-loading" role="status">正在加载照片…</span>{/if}
		{:else}
			<div class="notice" role="status">
				<Icon icon="mdi:image-off-outline" width="32" aria-hidden="true" />
				<h2>暂时无法展示照片</h2>
				<p>{message}</p>
				<button class="retry" onclick={loadAlbum}>重新读取</button>
			</div>
		{/if}
	</div>

	{#if current}
		<div class="controls" aria-label="相册操作">
			<button
				class="arrow previous"
				aria-label="上一张"
				disabled={photos.length < 2}
				onclick={() => move(-1)}
			>
				<Icon icon="mdi:chevron-left" width="40" aria-hidden="true" />
			</button>
			<button
				class="arrow next"
				aria-label="下一张"
				disabled={photos.length < 2}
				onclick={() => move(1)}
			>
				<Icon icon="mdi:chevron-right" width="40" aria-hidden="true" />
			</button>
			<div class="utilities">
				<button
					aria-label={paused ? '继续播放' : '暂停播放'}
					aria-pressed={paused}
					onclick={() => (paused = !paused)}
				>
					<Icon icon={paused ? 'mdi:play' : 'mdi:pause'} width="22" aria-hidden="true" />
				</button>
				{#if fullscreenAvailable}
					<button aria-label={fullscreen ? '退出全屏' : '全屏显示'} onclick={toggleFullscreen}>
						<Icon
							icon={fullscreen ? 'mdi:fullscreen-exit' : 'mdi:fullscreen'}
							width="24"
							aria-hidden="true"
						/>
					</button>
				{/if}
			</div>
		</div>
		{#if photos.length > 1}
			<div class="pagination" aria-label="附近照片">
				{#each pagination as target (target)}
					<button
						class:active={target === index}
						aria-label={`显示第 ${target + 1} 张照片`}
						aria-current={target === index ? 'true' : undefined}
						onclick={() => selectPhoto(target)}><span></span></button
					>
				{/each}
			</div>
		{/if}
		<span class="sr-only" role="status"
			>{paused ? '已暂停' : '自动轮播，每张 30 秒'}。已跳过 {failedCount} 张无法加载的照片。</span
		>
	{/if}
	{#if fullscreenError}<p class="fullscreen-error" role="status">{fullscreenError}</p>{/if}
</section>

<style>
	.album {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: var(--album-height, 80dvh);
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: #101112;
		color: #fff;
		outline: none;
	}
	.stage {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.stage img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		opacity: 0;
		transition: opacity 450ms ease;
	}
	.stage img.ready {
		opacity: 1;
	}
	.controls {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
		transition: opacity 240ms ease;
	}
	.album:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
	.controls-visible .controls,
	.album:focus-visible .controls,
	.album:has(:focus-visible) .controls {
		opacity: 1;
	}
	.controls-visible .controls button,
	.album:focus-visible .controls button,
	.album:has(:focus-visible) .controls button {
		pointer-events: auto;
	}
	button {
		display: grid;
		place-items: center;
		border: 0;
		padding: 0;
		color: #fff;
		cursor: pointer;
		font: inherit;
		-webkit-tap-highlight-color: transparent;
	}
	.arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: rgb(0 0 0 / 48%);
		transition: background 180ms ease;
	}
	.previous {
		left: clamp(16px, 3vw, 48px);
	}
	.next {
		right: clamp(16px, 3vw, 48px);
	}
	.arrow:hover {
		background: rgb(0 0 0 / 65%);
	}
	.arrow:active {
		background: rgb(0 0 0 / 75%);
	}
	button:disabled {
		opacity: 0.3;
		cursor: default;
	}
	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 5px;
	}
	.utilities {
		position: absolute;
		right: 24px;
		bottom: max(24px, env(safe-area-inset-bottom));
		display: flex;
		gap: 8px;
	}
	.utilities button {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgb(0 0 0 / 48%);
	}
	.utilities button:hover {
		background: rgb(0 0 0 / 65%);
	}
	.pagination {
		position: absolute;
		bottom: max(24px, env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		padding: 0 6px;
		border-radius: 24px;
		background: rgb(0 0 0 / 48%);
	}
	.pagination button {
		width: 32px;
		height: 44px;
		background: transparent;
		border-radius: 50%;
	}
	.pagination span {
		width: 6px;
		height: 6px;
		border-radius: 4px;
		background: rgb(255 255 255 / 65%);
		transition:
			width 240ms ease,
			background 240ms ease;
	}
	.pagination .active span {
		width: 8px;
		height: 8px;
		background: #fff;
	}
	.pagination button:hover span {
		background: #fff;
	}
	.notice {
		display: grid;
		justify-items: center;
		gap: 16px;
		padding: 32px;
		text-align: center;
	}
	.notice h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 500;
	}
	.notice p {
		margin: 0;
		max-width: 42ch;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.retry {
		min-height: 44px;
		margin-top: 8px;
		padding: 0 24px;
		border: 1px solid rgb(255 255 255 / 50%);
		border-radius: 24px;
		background: transparent;
	}
	.retry:hover {
		background: rgb(255 255 255 / 12%);
	}
	.photo-loading {
		padding: 8px 16px;
		font-size: 0.875rem;
	}
	.fullscreen-error {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 88px;
		width: fit-content;
		max-width: calc(100% - 32px);
		margin: 0 auto;
		padding: 12px 16px;
		background: rgb(0 0 0 / 80%);
		border-radius: 8px;
		font-size: 0.875rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.album:fullscreen {
		height: 100dvh;
	}
	.album::backdrop {
		background: #101112;
	}
	@media (max-width: 768px) {
		.arrow {
			width: 48px;
			height: 48px;
		}
		.previous {
			left: 12px;
		}
		.next {
			right: 12px;
		}
		.utilities {
			right: 12px;
			bottom: max(16px, env(safe-area-inset-bottom));
			gap: 4px;
		}
		.pagination {
			bottom: max(16px, env(safe-area-inset-bottom));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stage img,
		.controls,
		.arrow,
		.pagination span {
			transition: none;
		}
	}
</style>
