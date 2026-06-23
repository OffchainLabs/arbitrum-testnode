import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function findProjectRoot(startDir = import.meta.dirname): string {
	let current = resolve(startDir);
	for (;;) {
		if (
			existsSync(resolve(current, "docker/docker-compose.yaml")) &&
			existsSync(resolve(current, "config"))
		) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Unable to locate arbitrum-testnode project root from ${startDir}`);
		}
		current = parent;
	}
}

let cached: string | undefined;
export function projectRoot(): string {
	if (cached === undefined) {
		cached = findProjectRoot();
	}
	return cached;
}
