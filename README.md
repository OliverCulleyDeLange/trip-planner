# Trip Scheduler

A simple SvelteKit web application for coordinating dates with a group of people going on a trip. Built with TypeScript and Tailwind CSS.

## Features

- **Create Events**: Set up trip events with names and descriptions
- **Add Availability**: Each participant can add their available date ranges
- **Visual Timeline**: See everyone's availability on an interactive bar graph
- **Privacy Policy**: Clear information about data handling
- **In-Memory Storage**: Development mode with session-based data storage

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

```bash
# Install dependencies
npm install
```

## Developing

Once you've installed dependencies, start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Usage

1. Navigate to the home page
2. Create a new event by providing a name and optional description
3. On the event's schedule page, add your availability by entering your name and date range
4. View the timeline graph to see overlapping availability across all participants

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- Svelte Stores - State management

## Note

This application currently stores all data in memory for development purposes. Data will be lost when the page is refreshed or the server is restarted.
