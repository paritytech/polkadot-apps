#!/bin/bash
set -e

pnpm install

# Convenience setup as we (have claude) reference these products for common patterns/needs
mkdir -p reference-repos
[ -d "reference-repos/mark3t" ] || git clone https://github.com/paritytech/mark3t.git reference-repos/mark3t
[ -d "reference-repos/task-rabbit" ] || git clone https://github.com/paritytech/task-rabbit.git reference-repos/task-rabbit
[ -d "reference-repos/hackm3" ] || git clone https://github.com/paritytech/hackm3.git reference-repos/hackm3
[ -d "reference-repos/tick3t" ] || git clone https://github.com/paritytech/tick3t.git reference-repos/tick3t
[ -d "reference-repos/t3rminal" ] || git clone https://github.com/paritytech/t3rminal.git reference-repos/t3rminal
