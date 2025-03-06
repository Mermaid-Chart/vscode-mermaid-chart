const { glob } = require('glob');
const { execSync } = require('child_process');
const path = require('path');

// Get all test files
const testFiles = glob.sync('./src/test/suite/**/*.ts');

// Construct the esbuild command
const entryPoints = [
  './src/extension.ts',
  './src/test/runTest.ts',
  ...testFiles
].map(file => `"${file}"`).join(' ');

const command = `esbuild ${entryPoints} --sourcemap --bundle --outdir=out --external:vscode --format=cjs --platform=node`;

// Run the commands
execSync('tsc -p ./ --noEmit', { stdio: 'inherit' });
execSync(command, { stdio: 'inherit' }); 
