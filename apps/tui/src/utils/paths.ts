import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedOutputDir: string | null = null;

export function findOutputDir(): string {
	if (cachedOutputDir) return cachedOutputDir;

	// Allow override via environment variable
	if (process.env.ISLAM_OUTPUT_DIR && existsSync(process.env.ISLAM_OUTPUT_DIR)) {
		cachedOutputDir = process.env.ISLAM_OUTPUT_DIR;
		return cachedOutputDir;
	}

	const candidates = [
		// From dist/utils/ or src/utils/ — up to apps/, then sibling
		join(__dirname, "../../../content-producer/output"),
		join(__dirname, "../../..", "content-producer/output"),
		join(process.cwd(), "apps/content-producer/output"),
		join(process.cwd(), "output"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			cachedOutputDir = candidate;
			return cachedOutputDir;
		}
	}

	// Traverse up from __dirname
	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const outputPath = join(dir, "apps/content-producer/output");
		if (existsSync(outputPath)) {
			cachedOutputDir = outputPath;
			return cachedOutputDir;
		}
		const siblingPath = join(dir, "content-producer/output");
		if (existsSync(siblingPath)) {
			cachedOutputDir = siblingPath;
			return cachedOutputDir;
		}
		dir = dirname(dir);
	}

	cachedOutputDir = join(process.cwd(), "apps/content-producer/output");
	return cachedOutputDir;
}
