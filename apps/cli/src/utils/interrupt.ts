/**
 * Creates an interrupt handler for Ctrl+C graceful shutdown
 * Returns a state object and handler function
 */
export function createInterruptHandler(): {
	state: { interrupted: boolean };
	handler: () => void;
	attach: () => void;
	detach: () => void;
} {
	const state = { interrupted: false };

	const handler = () => {
		if (state.interrupted) {
			console.log("\nForce quit.");
			process.exit(1);
		}
		state.interrupted = true;
		console.log("\n\nInterrupted! Finishing current operation then stopping...");
		console.log("(Press Ctrl+C again to force quit)\n");
	};

	return {
		state,
		handler,
		attach: () => process.on("SIGINT", handler),
		detach: () => process.off("SIGINT", handler),
	};
}
