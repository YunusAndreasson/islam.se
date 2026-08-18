import { type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

// Multilingual E5 - supports 100 languages including Swedish and Arabic
const LOCAL_MODEL = "Xenova/multilingual-e5-small";
const LOCAL_EMBEDDING_DIMENSIONS = 384;

// ⚠️ Caches the PROMISE, not the resolved pipeline. Caching the resolved value left a
// window between the null check and the await in which every concurrent caller also saw
// null and started its own load. The corpus stage fans its angle searches out through
// nested Promise.all, so ~24 of them raced and each held a separate ~200MB model: the
// fordjupning run died with "Ineffective mark-compacts near heap limit" at 4GB, inside
// a stage whose log ("Local embedding model loaded." ×24) had shown the cause all along.
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Initializes the local embedding model (lazy loading)
 */
function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (!extractorPromise) {
		console.log("Loading local embedding model (first time may download ~470MB)...");
		extractorPromise = pipeline("feature-extraction", LOCAL_MODEL, {
			dtype: "fp32",
		}).then(
			(loaded) => {
				console.log("Local embedding model loaded.");
				return loaded;
			},
			(err) => {
				// A rejected promise must not stay cached, or one transient failure poisons
				// every later call for the life of the process.
				extractorPromise = null;
				throw err;
			},
		);
	}
	return extractorPromise;
}

/**
 * Generates an embedding using local multilingual-e5-small model.
 * No API key required - runs entirely locally.
 *
 * Note: E5 models expect a prefix for better results:
 * - "query: " for search queries
 * - "passage: " for documents/quotes being indexed
 */
export async function generateLocalEmbedding(
	text: string,
	type: "query" | "passage" = "query",
): Promise<Float32Array> {
	const ext = await getExtractor();

	// E5 models work better with prefixes
	const prefixedText = type === "query" ? `query: ${text}` : `passage: ${text}`;

	const output = await ext(prefixedText, { pooling: "mean", normalize: true });

	// Output is a Tensor, convert to Float32Array
	return new Float32Array(output.data as Float32Array);
}

/**
 * Generates embeddings for multiple texts in a batch.
 * More efficient than calling generateLocalEmbedding multiple times.
 * Processes items in parallel within each batch for better performance.
 */
export async function generateLocalEmbeddings(
	texts: string[],
	type: "query" | "passage" = "passage",
): Promise<Float32Array[]> {
	if (texts.length === 0) return [];

	const ext = await getExtractor();

	// Prefix all texts
	const prefixedTexts = texts.map((t) => (type === "query" ? `query: ${t}` : `passage: ${t}`));

	const results: Float32Array[] = [];

	// Process in batches to avoid memory issues
	// Each batch is processed in parallel for better performance
	const batchSize = 32;
	for (let i = 0; i < prefixedTexts.length; i += batchSize) {
		const batch = prefixedTexts.slice(i, i + batchSize);

		// Process batch items in parallel
		const batchResults = await Promise.all(
			batch.map(async (text) => {
				const output = await ext(text, { pooling: "mean", normalize: true });
				return new Float32Array(output.data as Float32Array);
			}),
		);
		results.push(...batchResults);
	}

	return results;
}

/**
 * Returns the dimension size for local embeddings
 */
export function getLocalEmbeddingDimensions(): number {
	return LOCAL_EMBEDDING_DIMENSIONS;
}

/**
 * Preload the model (useful for warming up before heavy operations)
 */
export async function preloadLocalModel(): Promise<void> {
	await getExtractor();
}
