import { describe, expect, it } from "vitest";
import { jsonForScript, readJsonScript } from "./json-script";

const scriptWith = (text: string | null) => ({ textContent: text }) as Element;

describe("JSON handed to a page's script", () => {
	it("cannot end the <script> it is written into", () => {
		const json = jsonForScript([{ name: "Moské </script><img src=x onerror=alert(1)>" }]);
		expect(
			json,
			"a literal </script> would close the element and run the rest as HTML",
		).not.toContain("</");
		expect(JSON.parse(json)).toEqual([{ name: "Moské </script><img src=x onerror=alert(1)>" }]);
	});

	it("reads back what was written", () => {
		const data = [{ id: "a", lat: 59.3, lng: 18.1 }];
		expect(readJsonScript(scriptWith(jsonForScript(data)), [])).toEqual(data);
	});

	it("falls back when the element is missing, empty or broken", () => {
		expect(readJsonScript(null, "fallback")).toBe("fallback");
		expect(readJsonScript(scriptWith(""), "fallback")).toBe("fallback");
		expect(
			readJsonScript(scriptWith('[{"id":'), "fallback"),
			"a truncated payload must not throw",
		).toBe("fallback");
	});
});
