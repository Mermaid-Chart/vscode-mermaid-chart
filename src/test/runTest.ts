import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Get the grep pattern from command line arguments if provided
		const grep = process.argv.find((arg) => arg.startsWith('--grep='))?.split('=')[1];

		// Download VS Code, unzip it and run the integration test
		await runTests({ 
			extensionDevelopmentPath, 
			extensionTestsPath,
			// Pass grep pattern to VS Code test runner
			launchArgs: grep ? ['--grep', grep] : []
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();