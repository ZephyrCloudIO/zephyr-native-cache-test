'use strict';

const {spawnSync} = require('node:child_process');

const jest = require.resolve('jest/bin/jest', {paths: [process.cwd()]});
const args = process.argv.slice(2).filter(arg => arg !== '--');
const result = spawnSync(process.execPath, [jest, ...args], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
