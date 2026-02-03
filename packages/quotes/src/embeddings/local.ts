import { type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

// Multilingual E5 - supports 100 languages including Swedish and Arabic
const LOCAL_MODEL = "Xenova/multilingual-e5-small";
const LOCAL_EMBEDDING_DIMENSIONS = 384;

let extractor: FeatureExtractionPipeline | null = null;

/**
 * Initializes the local embedding model (lazy loading)
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (!extractor) {
		console.log("Loading local embedding model (first time may download ~470MB)...");
		extractor = await pipeline("feature-extraction", LOCAL_MODEL, {
			dtype: "fp32",
		});
		console.log("Local embedding model loaded.");
	}
	return extractor;
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
	const batchSize = 32;
	for (let i = 0; i < prefixedTexts.length; i += batchSize) {
		const batch = prefixedTexts.slice(i, i + batchSize);

		for (const text of batch) {
			const output = await ext(text, { pooling: "mean", normalize: true });
			results.push(new Float32Array(output.data as Float32Array));
		}
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
