import path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 60000,
		grep: process.env.MOCHA_GREP
	});

	const testsRoot = path.resolve(__dirname, '.');

	return new Promise((c, e) => {
		// Changed pattern to include subdirectories explicitly
		glob('**/**/*.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach(f => {
				console.log(`Loading test file: ${path.resolve(testsRoot, f)}`);
				mocha.addFile(path.resolve(testsRoot, f));
			});

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}
