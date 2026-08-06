<script lang="ts">
	import { editMode, motion, record, dragging, itemHeight, states, dashboard } from '$lib/Stores';
	import { onMount, tick } from 'svelte';
	import { sortable } from '$lib/Actions/sortable';
	import Content from '$lib/Main/Content.svelte';
	import SectionHeader from '$lib/Main/SectionHeader.svelte';
	import HorizontalStackHeader from '$lib/Main/HorizontalStackHeader.svelte';
	import VerticalStackHeader from '$lib/Main/VerticalStackHeader.svelte';
	import Scenes from '$lib/Main/Scenes.svelte';
	import { handleVisibility, mediaQueries } from '$lib/Conditional';
	import { generateId } from '$lib/Utils';

	let { view, altKeyPressed }: { view: any; altKeyPressed: boolean } = $props();

	const stackHeight = $itemHeight * 1.65;

	let mounted = $state(false);
	let mainEl = $state<HTMLElement>();
	onMount(() => {
		mounted = true;
		mainEl?.addEventListener('dndreceive', handleReceive);
		return () => mainEl?.removeEventListener('dndreceive', handleReceive);
	});

	function handleDragStart() {
		$dragging = true;
		document.body.style.height = `${parseFloat(getComputedStyle(document.body).height) + 1}px`;
	}

	async function handleDragEnd() {
		// `view` is a plain prop object, so sortable's mutations don't notify the
		// $dashboard store and keyed each blocks keep stale refs - the UI would
		// render the pre-drag order while the data already changed. Deep clone to
		// refresh all refs, same as undo/redo does when restoring history.
		dashboard.update((d) => JSON.parse(JSON.stringify(d)));
		$record();
		$dragging = false;
		await tick();
		document.body.style.height = 'auto';
	}

	function maybeCloneItem(items: any[], oldIndex: number, newIndex: number): any[] {
		if (altKeyPressed) {
			const cloned = { ...items[oldIndex], id: generateId($dashboard) };
			const result = [...items];
			result.splice(newIndex, 0, cloned);
			return result;
		}
		return items;
	}

	function sectionGroupPut(_to: any, _from: any, dragEl: HTMLElement): boolean {
		const dragType = dragEl.dataset.sectionType;
		if (dragType === 'horizontal-stack' || dragType === 'vertical-stack' || dragType === 'scenes') {
			return false;
		}
		return true;
	}

	/**
	 * Recursively removes a section (by id) from anywhere in the
	 * view.sections tree (top level or inside any stack) and returns it.
	 */
	function removeSectionById(sections: any[], id: string): any | undefined {
		const index = sections.findIndex((s) => String(s?.id) === id);
		if (index !== -1) {
			return sections.splice(index, 1)[0];
		}
		for (const section of sections) {
			if (Array.isArray(section?.sections)) {
				const found = removeSectionById(section.sections, id);
				if (found) return found;
			}
		}
		return undefined;
	}

	/**
	 * Finds a stack's `.sections` array by the stack's id.
	 */
	function findStackSections(sections: any[], id: string): any[] | undefined {
		for (const section of sections) {
			if (String(section?.id) === id && Array.isArray(section?.sections)) {
				return section.sections;
			}
			if (Array.isArray(section?.sections)) {
				const found = findStackSections(section.sections, id);
				if (found) return found;
			}
		}
		return undefined;
	}

	/**
	 * Recursively removes an item (by id) from any section's `.items`
	 * array anywhere in the tree and returns it.
	 */
	function removeItemById(sections: any[], id: string): any | undefined {
		for (const section of sections) {
			if (Array.isArray(section?.items)) {
				const index = section.items.findIndex((it: any) => String(it?.id) === id);
				if (index !== -1) return section.items.splice(index, 1)[0];
			}
			if (Array.isArray(section?.sections)) {
				const found = removeItemById(section.sections, id);
				if (found) return found;
			}
		}
		return undefined;
	}

	/**
	 * Finds a section's `.items` array by the section's id.
	 */
	function findSectionItems(sections: any[], id: string): any[] | undefined {
		for (const section of sections) {
			if (String(section?.id) === id) {
				if (!Array.isArray(section.items)) section.items = [];
				return section.items;
			}
			if (Array.isArray(section?.sections)) {
				const found = findSectionItems(section.sections, id);
				if (found) return found;
			}
		}
		return undefined;
	}

	/**
	 * Handles cross-container drops dispatched via `dndreceive`
	 * (SortableJS moved the DOM, `sortable.ts` reverted it). Mirrors
	 * the move in the data tree for both item and section moves.
	 * The nearest tagged container decides which kind of move it is:
	 * `data-items-of` -> item into a section, `data-sections-of` ->
	 * section into a stack (or root).
	 */
	function handleReceive(event: Event) {
		const detail = (event as CustomEvent).detail as { id: string; newIndex: number };
		if (!detail?.id) return;

		const container = (event.target as HTMLElement)?.closest(
			'[data-items-of], [data-sections-of]'
		) as HTMLElement | null;
		if (!container) return;

		let moved: any;
		let targetArr: any[] | undefined;

		if (container.dataset.itemsOf) {
			// item -> section
			moved = removeItemById(view.sections, detail.id);
			if (!moved) return;
			targetArr = findSectionItems(view.sections, container.dataset.itemsOf);
		} else {
			// section -> stack / root
			moved = removeSectionById(view.sections, detail.id);
			if (!moved) return;
			targetArr =
				container.dataset.sectionsOf === 'root'
					? view.sections
					: findStackSections(view.sections, container.dataset.sectionsOf as string);
		}

		if (!targetArr) return;

		const index = Math.max(0, Math.min(detail.newIndex ?? targetArr.length, targetArr.length));
		targetArr.splice(index, 0, moved);

		dashboard.update((d) => JSON.parse(JSON.stringify(d)));
		$record();
	}

	/**
	 * Builds a horizontal-stack's column template from each child
	 * section's optional `width` weight (defaults to 1), so widths
	 * like 2:1 produce a 2/3 : 1/3 split instead of equal columns.
	 */
	function stackColumns(sections: any[] | undefined): string {
		if (!sections?.length) return '';
		return sections
			.map((s) => {
				const weight = Number(s?.width);
				return `${Number.isFinite(weight) && weight > 0 ? weight : 1}fr`;
			})
			.join(' ');
	}

	function sectionStyles(sectionType: string, editMode: boolean, motion: number, empty: boolean) {
		return `
			min-height: ${sectionType === 'scenes' ? '4.8rem' : `${$itemHeight}px`};
			background-color: ${empty ? 'rgba(255, 190, 10, 0.25)' : sectionType === 'scenes' ? 'rgba(0, 0, 0, 0.125)' : 'transparent'};
			outline: ${empty ? '2px dashed #ffc107' : 'none'};
			transition: ${
				editMode ? `background-color ${motion / 2}ms ease, min-height ${motion}ms ease` : 'none'
			};
    `;
	}

	function itemStyles(type: string) {
		const large = ['conditional_media', 'spotify_player_large', 'entities'];
		const camera = ['camera', 'unifi-camera'];
		if (type === 'picture_elements') {
			return `
			grid-column: 1 / -1;
			display: ${type ? '' : 'none'};
    `;
		}
		// camera cards occupy one flexible column (see the .items:has([data-camera])
		// rule below), so multiple cameras auto-fit two-per-row on wide screens
		if (camera.includes(type)) {
			return `
			grid-column: span 1;
			grid-row: span 4;
			display: ${type ? '' : 'none'};
    `;
		}
		return `
			grid-column: ${large.includes(type) ? 'span 2' : 'span 1'};
			grid-row: ${large.includes(type) ? 'span 4' : 'span 1'};
			display: ${type ? '' : 'none'};
    `;
	}

	let viewSections = $derived(
		$editMode
			? view?.sections
			: typeof mounted === 'boolean' &&
					typeof $mediaQueries === 'object' &&
					handleVisibility($editMode, view?.sections, $states)
	);
</script>

<main
	bind:this={mainEl}
	data-sections-of="root"
	style:transition="opacity {$motion}ms ease, outline-color {$motion}ms ease"
	style:opacity={$editMode && view?.sections.length === 0 ? '0' : '1'}
	use:sortable={{
		group: { name: 'section', put: sectionGroupPut },
		animation: $motion,
		disabled: !$editMode,
		ghostClass: 'sortable-ghost',
		handle: '.drag-handle',
		items: view.sections,
		onStart: handleDragStart,
		onFinalize: async (newItems) => {
			view.sections = newItems;
			await handleDragEnd();
		}
	}}
>
	{#each viewSections as section (section?.id)}
		<section id={String(section?.id)} data-id={section?.id} data-section-type={section?.type}>
			<!-- horizontal stack -->
			{#if section?.type === 'horizontal-stack'}
				<HorizontalStackHeader {view} {section} />

				<div
					class="horizontal-stack"
					data-sections-of={String(section?.id)}
					style:grid-template-columns={stackColumns(section?.sections)}
					style:min-height="{stackHeight}px"
					style:outline="2px dashed {$editMode ? '#ffc008' : 'transparent'}"
					style:transition="min-height {$motion}ms ease, outline {$motion / 2}ms ease"
					use:sortable={{
						group: { name: 'section', put: sectionGroupPut },
						animation: $motion,
						disabled: !$editMode,
						ghostClass: 'sortable-ghost',
						handle: '.drag-handle',
						items: section.sections ?? [],
						onStart: handleDragStart,
						onFinalize: async (newItems) => {
							const stack = view?.sections.find(
								(s: any) =>
									s.id === section.id &&
									(s.type === 'horizontal-stack' || s.type === 'vertical-stack')
							);
							if (stack) {
								stack.sections = newItems.map((item: any) => ({
									...item,
									items: item.items ?? []
								}));
								view.sections = [...view.sections];
							}
							await handleDragEnd();
						}
					}}
				>
					{#each section?.sections ?? [] as stackSection (stackSection?.id)}
						<section
							id={String(stackSection.id)}
							data-id={stackSection.id}
							data-section-type={stackSection?.type}
							style:overflow="hidden"
						>
							<!-- nested vertical stack inside horizontal stack -->
							{#if stackSection?.type === 'vertical-stack'}
								<VerticalStackHeader {view} section={stackSection} />

								<div
									class="vertical-stack nested"
									data-sections-of={String(stackSection?.id)}
									style:min-height="{stackHeight}px"
									style:outline="2px dashed {$editMode ? '#08c7ff' : 'transparent'}"
									style:transition="min-height {$motion}ms ease, outline {$motion / 2}ms ease"
									use:sortable={{
										group: { name: 'section', put: sectionGroupPut },
										animation: $motion,
										disabled: !$editMode,
										ghostClass: 'sortable-ghost',
										handle: '.drag-handle',
										items: stackSection.sections ?? [],
										onStart: handleDragStart,
										onFinalize: async (newItems) => {
											const parentStack = view?.sections.find(
												(s: any) => s.id === section.id && s.type === 'horizontal-stack'
											);
											if (parentStack) {
												const nestedStack = parentStack.sections?.find(
													(s: any) => s.id === stackSection.id && s.type === 'vertical-stack'
												);
												if (nestedStack) {
													nestedStack.sections = newItems.map((item: any) => ({
														...item,
														items: item.items ?? []
													}));
													view.sections = [...view.sections];
												}
											}
											await handleDragEnd();
										}
									}}
								>
									{#each stackSection?.sections ?? [] as nestedSection (nestedSection?.id)}
										{@const empty = $editMode && !nestedSection?.items?.length}
										<section
											id={String(nestedSection.id)}
											data-id={nestedSection.id}
											data-section-type={nestedSection?.type}
											style:overflow="hidden"
										>
											<SectionHeader {view} section={nestedSection} />
											<div
												class="items"
												data-items-of={String(nestedSection?.id)}
												style={sectionStyles(stackSection?.type, $editMode, $motion, empty)}
												use:sortable={{
													group: 'item',
													animation: $motion,
													disabled: !$editMode,
													ghostClass: 'sortable-ghost',
													items: nestedSection.items ?? [],
													onStart: handleDragStart,
													onFinalize: async (newItems, evt) => {
														const parentStack = view?.sections.find(
															(s: any) => s.id === section.id && s.type === 'horizontal-stack'
														);
														if (parentStack) {
															const ns = parentStack.sections?.find(
																(s: any) => s.id === stackSection.id && s.type === 'vertical-stack'
															);
															if (ns) {
																const sec = ns.sections?.find(
																	(s: any) => s.id === nestedSection.id
																);
																if (sec) {
																	sec.items = maybeCloneItem(
																		newItems,
																		evt.oldIndex ?? 0,
																		evt.newIndex ?? 0
																	);
																	view.sections = [...view.sections];
																}
															}
														}
														await handleDragEnd();
													}
												}}
											>
												{#each nestedSection?.items ?? [] as item (item.id)}
													<div
														data-id={item?.id}
														class="item"
														tabindex="-1"
														style={itemStyles(item?.type)}
													>
														<Content {item} sectionName={nestedSection?.name} />
													</div>
												{/each}
											</div>
										</section>
									{/each}
								</div>
							{:else}
								<!-- regular section inside horizontal stack -->
								{@const empty = $editMode && !stackSection?.items?.length}
								<SectionHeader {view} section={stackSection} />
								<div
									class="items"
									data-items-of={String(stackSection?.id)}
									style={sectionStyles(section?.type, $editMode, $motion, empty)}
									use:sortable={{
										group: 'item',
										animation: $motion,
										disabled: !$editMode,
										ghostClass: 'sortable-ghost',
										items: stackSection.items ?? [],
										onStart: handleDragStart,
										onFinalize: async (newItems, evt) => {
											const sec = view?.sections
												.find((s: any) =>
													s.sections?.some((sub: any) => sub.id === stackSection.id)
												)
												?.sections.find((sub: any) => sub.id === stackSection.id);
											if (sec) {
												sec.items = maybeCloneItem(newItems, evt.oldIndex ?? 0, evt.newIndex ?? 0);
												view.sections = [...view.sections];
											}
											await handleDragEnd();
										}
									}}
								>
									{#each stackSection?.items ?? [] as item (item.id)}
										<div
											data-id={item?.id}
											class="item"
											tabindex="-1"
											style={itemStyles(item?.type)}
										>
											<Content {item} sectionName={stackSection?.name} />
										</div>
									{/each}
								</div>
							{/if}
						</section>
					{/each}
				</div>

				<!-- vertical stack -->
			{:else if section?.type === 'vertical-stack'}
				<VerticalStackHeader {view} {section} />

				<div
					class="vertical-stack"
					data-sections-of={String(section?.id)}
					style:min-height="{stackHeight}px"
					style:outline="2px dashed {$editMode ? '#08c7ff' : 'transparent'}"
					style:transition="min-height {$motion}ms ease, outline {$motion / 2}ms ease"
					use:sortable={{
						group: { name: 'section', put: sectionGroupPut },
						animation: $motion,
						disabled: !$editMode,
						ghostClass: 'sortable-ghost',
						handle: '.drag-handle',
						items: section.sections ?? [],
						onStart: handleDragStart,
						onFinalize: async (newItems) => {
							const stack = view?.sections.find(
								(s: any) =>
									s.id === section.id &&
									(s.type === 'horizontal-stack' || s.type === 'vertical-stack')
							);
							if (stack) {
								stack.sections = newItems.map((item: any) => ({
									...item,
									items: item.items ?? []
								}));
								view.sections = [...view.sections];
							}
							await handleDragEnd();
						}
					}}
				>
					{#each section?.sections ?? [] as stackSection (stackSection?.id)}
						{@const empty = $editMode && !stackSection?.items?.length}
						<section
							id={String(stackSection.id)}
							data-id={stackSection.id}
							data-section-type={stackSection?.type}
							style:overflow="hidden"
						>
							<SectionHeader {view} section={stackSection} />
							<div
								class="items"
								data-items-of={String(stackSection?.id)}
								style={sectionStyles(section?.type, $editMode, $motion, empty)}
								use:sortable={{
									group: 'item',
									animation: $motion,
									disabled: !$editMode,
									ghostClass: 'sortable-ghost',
									items: stackSection.items ?? [],
									onStart: handleDragStart,
									onFinalize: async (newItems, evt) => {
										const sec = view?.sections
											.find((s: any) => s.sections?.some((sub: any) => sub.id === stackSection.id))
											?.sections.find((sub: any) => sub.id === stackSection.id);
										if (sec) {
											sec.items = maybeCloneItem(newItems, evt.oldIndex ?? 0, evt.newIndex ?? 0);
											view.sections = [...view.sections];
										}
										await handleDragEnd();
									}
								}}
							>
								{#each stackSection?.items ?? [] as item (item.id)}
									<div data-id={item?.id} class="item" tabindex="-1" style={itemStyles(item?.type)}>
										<Content {item} sectionName={stackSection?.name} />
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>

				<!-- scenes -->
			{:else if section?.type === 'scenes'}
				{@const empty = $editMode && !section?.items?.length}
				<SectionHeader {view} {section} />
				<div
					class="scenes"
					data-items-of={String(section?.id)}
					style={sectionStyles(section?.type, $editMode, $motion, empty)}
					use:sortable={{
						group: 'item',
						animation: $motion,
						disabled: !$editMode,
						ghostClass: 'sortable-ghost',
						items: section.items ?? [],
						onStart: handleDragStart,
						onFinalize: async (newItems, evt) => {
							const sec = view?.sections.find((s: any) => s.id === section.id);
							if (sec) {
								sec.items = maybeCloneItem(newItems, evt.oldIndex ?? 0, evt.newIndex ?? 0);
								view.sections = [...view.sections];
							}
							await handleDragEnd();
						}
					}}
				>
					{#each section?.items ?? [] as item, index (item.id)}
						<div
							data-id={item?.id}
							tabindex="-1"
							class:divider={index !== section?.items?.length - 1}
						>
							<Scenes sel={item} />
						</div>
					{/each}
				</div>

				<!-- normal -->
			{:else}
				{@const empty = $editMode && !section?.items?.length}

				<SectionHeader {view} {section} />

				<div
					class="items"
					data-items-of={String(section?.id)}
					style={sectionStyles(section?.type, $editMode, $motion, empty)}
					use:sortable={{
						group: 'item',
						animation: $motion,
						disabled: !$editMode,
						ghostClass: 'sortable-ghost',
						items: section.items ?? [],
						onStart: handleDragStart,
						onFinalize: async (newItems, evt) => {
							const sec = view?.sections.find((s: any) => s.id === section.id);
							if (sec) {
								sec.items = maybeCloneItem(newItems, evt.oldIndex ?? 0, evt.newIndex ?? 0);
								view.sections = [...view.sections];
							}
							await handleDragEnd();
						}
					}}
				>
					{#each section?.items ?? [] as item (item.id)}
						<div data-id={item?.id} class="item" tabindex="-1" style={itemStyles(item?.type)}>
							<Content {item} sectionName={section?.name} />
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</main>

<style>
	main {
		grid-area: main;
		padding: 0 2rem 2rem;
		display: grid;
		gap: 1.5rem;
		outline: transparent;
		align-content: start;
	}

	section {
		display: grid;
		align-content: start;
	}

	.horizontal-stack {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 2rem;
		border-radius: 0.65rem;
		outline-offset: 3px;
		padding: 0.5rem;
	}

	.vertical-stack {
		display: grid;
		grid-auto-flow: row;
		grid-auto-rows: min-content;
		gap: 1.5rem;
		border-radius: 0.65rem;
		outline-offset: 3px;
		padding: 0.5rem;
	}

	.vertical-stack.nested {
		outline-offset: -3px;
	}

	.items {
		border-radius: 0.6rem;
		outline-offset: -2px;
		display: grid;
		grid-template-columns: repeat(auto-fill, 14.5rem);
		grid-auto-rows: min-content;
		gap: 0.4rem;
		border-radius: 0.6rem;
		height: 100%;
	}

	/* a section holding a picture-elements fills the whole width
	   instead of snapping to the fixed 14.5rem column grid */
	.items:has(:global([data-picture-elements])) {
		grid-template-columns: 1fr;
	}

	/* a section holding camera cards uses flexible columns so cameras auto-fit
	   multiple per row on wide screens (e.g. two-up on a tablet/desktop) */
	.items:has(:global([data-camera])) {
		grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
	}

	.item {
		position: relative;
		border-radius: 0.65rem;
	}

	/* Phone and Tablet (portrait) */
	@media all and (max-width: 768px) {
		main {
			padding: 0 1.25rem 1.25rem 1.25rem;
		}

		.horizontal-stack {
			grid-auto-flow: row;
			gap: 1.5rem;
		}

		.items {
			display: flex;
			flex-wrap: wrap;
		}
	}

	.scenes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		border-radius: 0.65rem;
		overflow: hidden;
		min-height: 5rem;
	}

	.scenes > .divider {
		border-right: 1px solid transparent;
	}

	:global(.sortable-ghost) {
		opacity: 0.4;
	}

	:global(.sortable-chosen) {
		outline: 2px dashed rgb(255, 192, 8);
		outline-offset: -2px;
		border-radius: 0.65rem;
	}
</style>
