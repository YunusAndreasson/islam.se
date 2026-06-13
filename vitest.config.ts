import { defineConfig } from "vitest/config";

// Root test config. `projects` (Vitest 4) replaces the deprecated
// vitest.workspace.ts array form and — unlike a bare root run — scopes the suite
// to ONLY these packages. That keeps apps/mobile out: it is a standalone Expo app
// with its own Jest setup (isolated from this repo's Biome + pnpm workspace too),
// and its Jest tests must not be picked up by the root vitest run.
export default defineConfig({
	test: {
		projects: [
			"packages/quotes/vitest.config.ts",
			"packages/orchestrator/vitest.config.ts",
			"apps/web/vitest.config.ts",
		],
	},
});
