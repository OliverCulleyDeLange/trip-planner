import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  base: '/trip-planner',
  output: 'server',
  adapter: cloudflare({ imageService: 'compile' }),
});
