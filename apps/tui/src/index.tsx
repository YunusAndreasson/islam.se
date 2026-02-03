#!/usr/bin/env node
import { render } from "ink";
import { App } from "./App.js";

// ANSI escape codes for alternate screen buffer (like vim/htop)
const enterAltScreen = "\x1b[?1049h";
const exitAltScreen = "\x1b[?1049l";
const clearScreen = "\x1b[2J\x1b[H";
const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";

// Enter alternate screen buffer and clear
process.stdout.write(enterAltScreen + clearScreen + hideCursor);

// Render the app
const { waitUntilExit } = render(<App />);

// Clean up on exit
async function cleanup() {
	process.stdout.write(showCursor + exitAltScreen);
}

// Handle various exit scenarios
process.on("exit", cleanup);
process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(0);
});

// Wait for app to exit
waitUntilExit().then(cleanup);
