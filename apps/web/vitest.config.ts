import { defineConfig } from "vitest/config";

// Web unit tests (pure helpers only — no Astro component rendering). Wired into the
// repo-root vitest `projects` array so `pnpm test` runs them alongside the packages.
export default defineConfig({
	test: {
		name: "web",
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
