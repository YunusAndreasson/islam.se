import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	"packages/quotes/vitest.config.ts",
	"packages/orchestrator/vitest.config.ts",
]);
