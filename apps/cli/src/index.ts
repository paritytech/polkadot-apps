#!/usr/bin/env node

import { Command } from "commander";
import { searchCommand } from "./commands/search.js";
import { infoCommand } from "./commands/info.js";
import { remixCommand } from "./commands/remix.js";
import { initCommand } from "./commands/init.js";
import { newCommand } from "./commands/new.js";
import { publishCommand } from "./commands/publish.js";
import { deployCommand } from "./commands/deploy.js";
import {
    buildCommand,
    setupCommand,
    accountCommand,
    templateCommand,
} from "./commands/delegate.js";

const program = new Command()
    .name("dot")
    .description("Developer CLI for the .dot app ecosystem on Polkadot")
    .version("0.1.0");

// App lifecycle
program.addCommand(newCommand);
program.addCommand(initCommand);
program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(publishCommand);

// Discovery
program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(remixCommand);

// Account & setup
program.addCommand(setupCommand);
program.addCommand(accountCommand);
program.addCommand(templateCommand);

program.parse();
