import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { registerTools } from "./tools.js";

function createServer() {
	const server = new McpServer({
		name: "islam-se-articles",
		version: "1.0.0",
	});
	registerTools(server);
	return server;
}

// Cloudflare Worker entry point
export default {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		// Health check / info endpoint
		if (new URL(request.url).pathname === "/") {
			return new Response(
				JSON.stringify({
					name: "islam-se-articles",
					description:
						"MCP server for islam.se — Swedish-language essays on Islamic intellectual tradition",
					mcp_endpoint: "https://mcp.islam.se/mcp",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}

		const server = createServer();
		return createMcpHandler(server)(request, env, ctx);
	},
};
