import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { locateStaticAsset } from "./static-path";

let directory: string;
let root: string;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "static-path-"));
	root = join(directory, "dist");
	mkdirSync(root);
	mkdirSync(join(directory, "dist-private"));
	writeFileSync(join(directory, "dist-private/secret.txt"), "private");
	writeFileSync(join(root, "index.html"), "home");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("serves normal files and directory indexes", () => {
	expect(locateStaticAsset(root, "/?x=1")).toEqual({
		file: join(root, "index.html"),
		pathname: "/",
		status: 200,
	});
});

// String-prefix checks treated dist-private as a child of dist; URL decoding
// exposes traversal even when the URL parser has already normalized literal dots.
it("rejects encoded traversal into a sibling with the same path prefix", () => {
	expect(locateStaticAsset(root, "/..%2fdist-private/secret.txt").status).toBe(403);
});

it("rejects symlinks outside the build, including a linked 404", () => {
	symlinkSync(join(directory, "dist-private/secret.txt"), join(root, "linked.txt"));
	symlinkSync(join(directory, "dist-private/secret.txt"), join(root, "404.html"));
	expect(locateStaticAsset(root, "/linked.txt").status).toBe(403);
	expect(locateStaticAsset(root, "/missing").status).toBe(403);
});

// Malformed percent escapes previously threw out of the request callback.
it.each(["/%ZZ", "/%00"])("answers malformed input without throwing: %s", (url) => {
	expect(locateStaticAsset(root, url)).toMatchObject({ file: null, status: 400 });
});

it("handles missing 404 pages and serves a valid fallback when present", () => {
	expect(locateStaticAsset(root, "/missing")).toMatchObject({ file: null, status: 404 });
	writeFileSync(join(root, "404.html"), "not found");
	expect(locateStaticAsset(root, "/missing")).toMatchObject({
		file: join(root, "404.html"),
		status: 404,
	});
});
