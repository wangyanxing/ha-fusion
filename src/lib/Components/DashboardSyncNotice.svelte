<script lang="ts">
	import { dashboardSyncReminder, lang } from '$lib/Stores';
</script>

{#if $dashboardSyncReminder}
	<aside class="sync-notice" aria-label={$lang('dashboard_sync_title')}>
		<div role="status">
			<h2>{$lang('dashboard_sync_title')}</h2>
			<p>{$lang('dashboard_sync_message')}</p>
		</div>
		<button onclick={() => ($dashboardSyncReminder = false)}>
			{$lang('dashboard_sync_dismiss')}
		</button>
	</aside>
{/if}

<style>
	.sync-notice {
		position: fixed;
		inset-inline-end: 1rem;
		bottom: max(1rem, env(safe-area-inset-bottom));
		z-index: 20;
		box-sizing: border-box;
		width: min(36rem, calc(100% - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: 1rem 1.2rem;
		border: 1px solid #ffc107;
		border-radius: 0.4rem;
		background: #272b2e;
		color: #fff;
		box-shadow: 0 6px 24px rgb(0 0 0 / 25%);
	}

	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #ffc107;
	}

	p {
		margin: 0.5rem 0 0.8rem;
		font-size: 0.925rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	button {
		min-height: 44px;
		padding: 0.5rem 0.8rem;
		border: 1px solid #ffc107;
		border-radius: 0.4rem;
		background: transparent;
		color: #ffc107;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: #ffc107;
		color: #272b2e;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
	}
</style>
