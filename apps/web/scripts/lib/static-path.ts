import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

function inside(root: string, file: string): boolean {
	const path = relative(root, file);
	return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Resolve a benchmark request inside one build, including symlink targets.
 * Missing pages return the build's 404 when present; unsafe paths never do.
 * A null file lets the server answer without trying to read a missing 404.html. */
export function locateStaticAsset(
	root: string,
	requestUrl: string,
): {
	file: string | null;
	pathname: string;
	status: 200 | 400 | 403 | 404;
} {
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(requestUrl, "http://bench").pathname);
		if (pathname.includes("\0")) throw new Error("NUL in pathname");
	} catch {
		return { file: null, pathname: "", status: 400 };
	}
	const base = realpathSync(root);
	let file = resolve(base, `.${pathname}`);
	if (!inside(base, file)) return { file: null, pathname, status: 403 };
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
	const status = existsSync(file) ? 200 : 404;
	if (status === 404) file = join(base, "404.html");
	if (!existsSync(file)) return { file: null, pathname, status };
	file = realpathSync(file);
	if (!inside(base, file)) return { file: null, pathname, status: 403 };
	if (!statSync(file).isFile()) return { file: null, pathname, status: 404 };
	return { file, pathname, status };
}
