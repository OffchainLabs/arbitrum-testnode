import { resolve } from "node:path";

export interface InitContext {
	projectRoot: string;
	configDir: string;
	composeFile: string;
	projectName: string;
}

export interface InitRuntime extends InitContext {
	dockerOpts: { composeFile: string; projectName: string };
}

export function createInitContext(projectRoot: string): InitContext {
	return {
		projectRoot,
		configDir: resolve(projectRoot, "config"),
		composeFile: resolve(projectRoot, "docker/docker-compose.yaml"),
		projectName: "arbitrum-testnode",
	};
}

export function createInitRuntime(context: InitContext): InitRuntime {
	return {
		...context,
		dockerOpts: {
			composeFile: context.composeFile,
			projectName: context.projectName,
		},
	};
}
