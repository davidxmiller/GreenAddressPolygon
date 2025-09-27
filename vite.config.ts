import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	// Leaflet can sometimes give "Outdated Optimize Dep" errors in vite dev.
	// Using include in optimizeDeps forces listed packages to be included in the pre-bundling step,
	// which can help avoid this issue.
	optimizeDeps: {
		include: ['leaflet']
	}	
});
