#!/usr/bin/env node

import { join } from "node:path";
import { Command } from "commander";
import { config } from "dotenv";
import { registerAllCommands } from "./commands/index.js";
import { PROJECT_ROOT } from "./utils/index.js";

// Load environment variables from project root
config({ path: join(PROJECT_ROOT, ".env") });

const program = new Command();

program
	.name("islam-cli")
	.description("CLI for managing the Islam.se quote database")
	.version("0.0.1");

registerAllCommands(program);

program.parse();
