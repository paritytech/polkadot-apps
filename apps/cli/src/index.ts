#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { remixCommand } from "./commands/remix.js";
import { buildCommand } from "./commands/build.js";
import { testCommand } from "./commands/test.js";
import { deployCommand } from "./commands/deploy.js";
import { infoCommand } from "./commands/info.js";
import { updateCommand } from "./commands/update.js";

const program = new Command()
    .name("dot")
    .description("Developer CLI for building Polkadot Apps")
    .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(remixCommand);
program.addCommand(buildCommand);
program.addCommand(testCommand);
program.addCommand(deployCommand);
program.addCommand(infoCommand);
program.addCommand(updateCommand);

program.parse();
