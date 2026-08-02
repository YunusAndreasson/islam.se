import { defineConfig } from "vitest/config";

// Web unit tests (pure helpers only — no Astro component rendering). Wired into the
// repo-root vitest `projects` array so `pnpm test` runs them alongside the packages.
//
// `functions/` is included as well as `src/`: the Pages Functions under it are the site's
// only untrusted input boundary (reader corrections, mosque corrections from the app), and
// their validation is exactly the code that must not regress unnoticed.
export default defineConfig({
	test: {
		name: "web",
		environment: "node",
		include: ["src/**/*.test.ts", "functions/**/*.test.ts"],
	},
});
