#!/usr/bin/env node

// WebSocket polyfill — must run before any command imports
import "./polyfill.js";

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { initCommand } from "./commands/init.js";
import { remixCommand } from "./commands/remix.js";
import { buildCommand } from "./commands/build.js";
import { deployCommand } from "./commands/deploy.js";
import { infoCommand } from "./commands/info.js";
import { updateCommand } from "./commands/update.js";

const program = new Command()
    .name("dot")
    .description("Developer CLI for building Polkadot Apps")
    .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(remixCommand);
program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(infoCommand);
program.addCommand(updateCommand);

program.parse();
