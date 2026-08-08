/**
 * The Claude models this repo runs on. One definition, imported everywhere.
 *
 * Five call sites used to carry their own copy of this map — svar-producer,
 * fordjupning-producer, orchestrator's claude-runner and utils, and the book
 * importer — so "move to the newest Opus" meant finding all five and never
 * missing one. On 2026-08-08 a sweep found them all correct but the surrounding
 * docs a generation behind, which is exactly how the drift starts.
 *
 * It lives in `@islam-se/quotes` because that is the only package the other two
 * depend on (quotes ← orchestrator ← content-producer), not because quotes owns
 * model policy. If a `core` package is ever added back, move it there.
 *
 * The keys are the tiers the code chooses between; the values are always the
 * CURRENT release of each tier. **Bump them here and nowhere else** — every
 * producer, runner and importer follows automatically.
 *
 * Model IDs are complete as written: never append a date suffix.
 */
export const MODEL_MAP = {
	/** Deep reasoning, long-horizon agentic work — the default for authoring. */
	opus: "claude-opus-5",
	/** Near-Opus quality at lower cost — used to economise on a long run. */
	sonnet: "claude-sonnet-5",
	/** Cheapest tier; bulk mechanical extraction over tens of thousands of rows. */
	haiku: "claude-haiku-4-5",
} as const;

/** The tier a caller asks for. */
export type ModelTier = keyof typeof MODEL_MAP;

/** A concrete model ID passed to the `claude` CLI or the SDK. */
export type ModelId = (typeof MODEL_MAP)[ModelTier];

/** The two tiers the content pipeline offers on the command line. */
export type PipelineModelTier = Extract<ModelTier, "opus" | "sonnet">;

/** Resolve a tier to the model ID currently serving it. */
export function getModelId(tier: ModelTier): ModelId {
	return MODEL_MAP[tier];
}
