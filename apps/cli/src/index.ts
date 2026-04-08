#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program.name("dot").description("CLI for building and managing Polkadot apps").version("0.0.1");

program.parse();
