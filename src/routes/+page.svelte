<script lang="ts">
	import { createEvent, events } from '$lib/stores/data';
	import { goto } from '$app/navigation';
	
	let eventName = $state('');
	let eventDescription = $state('');
	
	function handleCreateEvent() {
		if (eventName.trim()) {
			const event = createEvent(eventName, eventDescription);
			eventName = '';
			eventDescription = '';
			goto(`/schedule/${event.id}`);
		}
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="container mx-auto px-4 py-8">
		<div class="text-center mb-12">
			<h1 class="text-5xl font-bold text-gray-800 mb-4">Trip Scheduler</h1>
			<p class="text-xl text-gray-600">Coordinate dates with your group</p>
		</div>

		<div class="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
			<h2 class="text-3xl font-semibold text-gray-800 mb-6">Create a New Event</h2>
			
			<form onsubmit={(e) => { e.preventDefault(); handleCreateEvent(); }} class="space-y-6">
				<div>
					<label for="event-name" class="block text-sm font-medium text-gray-700 mb-2">
						Event Name
					</label>
					<input
						id="event-name"
						type="text"
						bind:value={eventName}
						placeholder="e.g., Summer Trip to Italy"
						class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						required
					/>
				</div>

				<div>
					<label for="event-description" class="block text-sm font-medium text-gray-700 mb-2">
						Description (optional)
					</label>
					<textarea
						id="event-description"
						bind:value={eventDescription}
						placeholder="Add any details about the trip..."
						rows="4"
						class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					></textarea>
				</div>

				<button
					type="submit"
					class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 transform hover:scale-105"
				>
					Create Event
				</button>
			</form>
		</div>

		{#if $events.length > 0}
			<div class="max-w-2xl mx-auto mt-8">
				<h3 class="text-2xl font-semibold text-gray-800 mb-4">Recent Events</h3>
				<div class="space-y-4">
					{#each $events as event}
						<a
							href="/schedule/{event.id}"
							class="block bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
						>
							<h4 class="text-xl font-semibold text-gray-800 mb-2">{event.name}</h4>
							{#if event.description}
								<p class="text-gray-600 mb-2">{event.description}</p>
							{/if}
							<p class="text-sm text-gray-500">
								Created: {new Date(event.createdAt).toLocaleDateString()}
							</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<div class="text-center mt-8">
			<a href="/privacy" class="text-blue-600 hover:text-blue-800 underline">
				Privacy Policy
			</a>
		</div>
	</div>
</div>
