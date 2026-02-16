<script lang="ts">
	import { page } from '$app/stores';
	import { events, availabilities, getEventById, getAvailabilitiesForEvent, addAvailability, type Availability } from '$lib/stores/data';
	import { goto } from '$app/navigation';
	
	let eventId = $derived($page.params.id);
	let event = $derived(getEventById(eventId, $events));
	let eventAvailabilities = $derived(getAvailabilitiesForEvent(eventId, $availabilities));
	
	let personName = $state('');
	let startDate = $state('');
	let endDate = $state('');
	
	function handleAddAvailability() {
		if (personName.trim() && startDate && endDate) {
			addAvailability(eventId, personName, startDate, endDate);
			personName = '';
			startDate = '';
			endDate = '';
		}
	}
	
	// Calculate timeline for visualization
	interface TimelineData {
		person: string;
		ranges: Array<{ start: Date; end: Date }>;
	}
	
	let timelineData = $derived.by((): TimelineData[] => {
		const dataByPerson = new Map<string, Array<{ start: Date; end: Date }>>();
		
		eventAvailabilities.forEach(avail => {
			if (!dataByPerson.has(avail.personName)) {
				dataByPerson.set(avail.personName, []);
			}
			dataByPerson.get(avail.personName)!.push({
				start: new Date(avail.startDate),
				end: new Date(avail.endDate)
			});
		});
		
		return Array.from(dataByPerson.entries()).map(([person, ranges]) => ({
			person,
			ranges
		}));
	});
	
	let minDate = $derived.by(() => {
		if (eventAvailabilities.length === 0) return null;
		return new Date(Math.min(...eventAvailabilities.map(a => new Date(a.startDate).getTime())));
	});
	
	let maxDate = $derived.by(() => {
		if (eventAvailabilities.length === 0) return null;
		return new Date(Math.max(...eventAvailabilities.map(a => new Date(a.endDate).getTime())));
	});
	
	let totalDays = $derived.by(() => {
		if (!minDate || !maxDate) return 0;
		return Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});
	
	function getPositionAndWidth(start: Date, end: Date): { left: string; width: string } {
		if (!minDate || totalDays === 0) return { left: '0%', width: '0%' };
		
		const startOffset = Math.floor((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
		const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		
		const leftPercent = (startOffset / totalDays) * 100;
		const widthPercent = (duration / totalDays) * 100;
		
		return {
			left: `${leftPercent}%`,
			width: `${widthPercent}%`
		};
	}
	
	function formatDateShort(date: Date | string | null | undefined): string {
		if (!date) return 'Invalid Date';
		const d = typeof date === 'string' ? new Date(date) : date;
		if (!d || typeof d.getTime !== 'function' || isNaN(d.getTime())) {
			return 'Invalid Date';
		}
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

{#if !event}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-gray-800 mb-4">Event not found</h1>
			<a href="/" class="text-blue-600 hover:text-blue-800 underline">
				Go back to home
			</a>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50">
		<div class="container mx-auto px-4 py-8">
			<div class="mb-6">
				<a href="/" class="text-blue-600 hover:text-blue-800 inline-flex items-center">
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					Back to Home
				</a>
			</div>
			
			<div class="bg-white rounded-lg shadow-lg p-8 mb-8">
				<h1 class="text-4xl font-bold text-gray-800 mb-2">{event.name}</h1>
				{#if event.description}
					<p class="text-gray-600 mb-4">{event.description}</p>
				{/if}
			</div>

			<div class="grid md:grid-cols-2 gap-8">
				<!-- Add Availability Form -->
				<div class="bg-white rounded-lg shadow-lg p-8">
					<h2 class="text-2xl font-semibold text-gray-800 mb-6">Add Your Availability</h2>
					
					<form onsubmit={(e) => { e.preventDefault(); handleAddAvailability(); }} class="space-y-6">
						<div>
							<label for="person-name" class="block text-sm font-medium text-gray-700 mb-2">
								Your Name
							</label>
							<input
								id="person-name"
								type="text"
								bind:value={personName}
								placeholder="Enter your name"
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								required
							/>
						</div>

						<div>
							<label for="start-date" class="block text-sm font-medium text-gray-700 mb-2">
								Start Date
							</label>
							<input
								id="start-date"
								type="date"
								bind:value={startDate}
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								required
							/>
						</div>

						<div>
							<label for="end-date" class="block text-sm font-medium text-gray-700 mb-2">
								End Date
							</label>
							<input
								id="end-date"
								type="date"
								bind:value={endDate}
								min={startDate}
								class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								required
							/>
						</div>

						<button
							type="submit"
							class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
						>
							Add Availability
						</button>
					</form>
				</div>

				<!-- Availability List -->
				<div class="bg-white rounded-lg shadow-lg p-8">
					<h2 class="text-2xl font-semibold text-gray-800 mb-6">Current Availability</h2>
					
					{#if eventAvailabilities.length === 0}
						<p class="text-gray-500 text-center py-8">No availability added yet. Be the first!</p>
					{:else}
						<div class="space-y-4">
							{#each eventAvailabilities as availability}
								<div class="border border-gray-200 rounded-lg p-4">
									<h3 class="font-semibold text-gray-800 mb-2">{availability.personName}</h3>
									<p class="text-sm text-gray-600">
										{new Date(availability.startDate).toLocaleDateString()} 
										- 
										{new Date(availability.endDate).toLocaleDateString()}
									</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Time Series Bar Graph -->
			{#if eventAvailabilities.length > 0 && minDate && maxDate}
				<div class="bg-white rounded-lg shadow-lg p-8 mt-8">
					<h2 class="text-2xl font-semibold text-gray-800 mb-6">Availability Timeline</h2>
					
					<div class="space-y-6">
						<!-- Timeline Header -->
						<div class="relative h-8 border-b-2 border-gray-300">
							<div class="absolute top-0 left-0 text-xs text-gray-600">
								{formatDateShort(minDate)}
							</div>
							<div class="absolute top-0 right-0 text-xs text-gray-600">
								{formatDateShort(maxDate)}
							</div>
						</div>

						<!-- Timeline Rows -->
						{#each timelineData as personData}
							<div class="mb-4">
								<div class="text-sm font-medium text-gray-700 mb-2">
									{personData.person}
								</div>
								<div class="relative h-10 bg-gray-100 rounded">
									{#each personData.ranges as range}
										{@const position = getPositionAndWidth(range.start, range.end)}
										<div
											class="absolute top-1 h-8 bg-blue-500 hover:bg-blue-600 rounded transition-colors"
											style="left: {position.left}; width: {position.width};"
											title="{formatDateShort(range.start)} - {formatDateShort(range.end)}"
										></div>
									{/each}
								</div>
							</div>
						{/each}
					</div>

					<!-- Legend -->
					<div class="mt-6 pt-6 border-t border-gray-200">
						<p class="text-sm text-gray-600">
							Hover over the bars to see exact dates. Each bar represents a period of availability.
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
