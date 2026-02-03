import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");

/**
 * Resolve a file path - if relative, resolve from PROJECT_ROOT
 */
export function resolvePath(filePath: string): string {
	if (filePath.startsWith("/")) {
		return filePath;
	}
	return join(PROJECT_ROOT, filePath);
}
