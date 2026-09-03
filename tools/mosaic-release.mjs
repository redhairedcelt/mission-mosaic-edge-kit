#!/usr/bin/env node

/** Command-line entry point for the offline Mission Mosaic release utility. */

import { runCli } from "./mosaic-release-lib.mjs";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`Mission Mosaic release error: ${error.message}`);
  process.exitCode = 1;
});
