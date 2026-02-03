import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 384; // Match local multilingual-e5-small dimensions

// Singleton client to reuse HTTP connections
let client: OpenAI | null = null;

function getClient(): OpenAI {
	if (!client) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error("OPENAI_API_KEY environment variable is required");
		}
		client = new OpenAI({ apiKey });
	}
	return client;
}

/**
 * Generates an embedding vector for a given text using OpenAI's API
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
	const response = await getClient().embeddings.create({
		model: EMBEDDING_MODEL,
		input: text,
		dimensions: EMBEDDING_DIMENSIONS,
	});

	const embedding = response.data[0]?.embedding;
	if (!embedding) {
		throw new Error("No embedding returned from OpenAI");
	}

	return new Float32Array(embedding);
}

/**
 * Generates embeddings for multiple texts in a single batch request
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
	if (texts.length === 0) {
		return [];
	}

	const response = await getClient().embeddings.create({
		model: EMBEDDING_MODEL,
		input: texts,
		dimensions: EMBEDDING_DIMENSIONS,
	});

	return response.data.map((item) => new Float32Array(item.embedding));
}

/**
 * Returns the expected dimension size of embedding vectors
 */
export function getEmbeddingDimensions(): number {
	return EMBEDDING_DIMENSIONS;
}
