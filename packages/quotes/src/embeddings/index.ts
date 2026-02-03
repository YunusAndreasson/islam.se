/**
 * Embedding generation modules
 */

// Local embeddings (no API key required)
export {
	generateLocalEmbedding,
	generateLocalEmbeddings,
	getLocalEmbeddingDimensions,
	preloadLocalModel,
} from "./local.js";
// OpenAI embeddings (requires API key)
export { generateEmbedding, generateEmbeddings, getEmbeddingDimensions } from "./openai.js";
