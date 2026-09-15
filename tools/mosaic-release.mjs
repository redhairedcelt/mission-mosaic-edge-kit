#!/usr/bin/env node

/** Command-line entry point for the offline Mission Mosaic release utility. */

import { runCli } from "./mosaic-release-lib.mjs";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`Mission Mosaic release error: ${error.message}`);
  if (process.argv[2] === "unlock" && !/flag this for a facilitator/i.test(error.message)) {
    console.error("The release did not complete. Please flag this for a facilitator.");
  }
  process.exitCode = 1;
});
