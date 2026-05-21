import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts", "apps/*/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
		exclude: [
			"apps/*/test/integration/**",
			"packages/*/test/integration/**",
			"node_modules/**",
			"dist/**",
		],
		environment: "node",
	},
});
