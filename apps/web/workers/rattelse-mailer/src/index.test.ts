import { describe, expect, it, vi } from "vitest";
import mailer from "./index.js";

function setup(payload: unknown) {
	const send = vi.fn(
		async (_message: { subject: string; html: string; replyTo?: string }) => undefined,
	);
	return {
		request: new Request("https://mailer.internal", {
			method: "POST",
			body: JSON.stringify(payload),
		}),
		env: { NOTIFY_TO: "editor@example.test", NOTIFY_FROM: "site@example.test", EMAIL: { send } },
	};
}

describe("correction mailer", () => {
	// request.json() accepted null and the following field access threw instead of 400.
	it.each([null, [], "text", 42])(
		"rejects non-object payloads without sending",
		async (payload) => {
			const { request, env } = setup(payload);
			expect((await mailer.fetch(request, env)).status).toBe(400);
			expect(env.EMAIL.send).not.toHaveBeenCalled();
		},
	);

	it("escapes reader HTML and keeps header values on one line", async () => {
		const { request, env } = setup({
			id: 1,
			page: "/page/\r\nBcc: other",
			description: '<script>alert("x")</script>',
			reporter_email: "reader@example.test",
		});
		expect((await mailer.fetch(request, env)).status).toBe(200);
		const message = env.EMAIL.send.mock.calls[0]?.[0];
		expect(message?.subject).not.toMatch(/[\r\n]/);
		expect(message?.html).toContain("&lt;script&gt;");
		expect(message?.html).not.toContain("<script>");
		expect(message?.replyTo).toBe("reader@example.test");
	});

	it("does not use an invalid reply address", async () => {
		const { request, env } = setup({ reporter_email: "a@example.test\r\nBcc: other@example.test" });
		await mailer.fetch(request, env);
		expect(env.EMAIL.send.mock.calls[0]?.[0].replyTo).toBeUndefined();
	});
});
