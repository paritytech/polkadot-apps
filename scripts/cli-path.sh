#!/bin/bash
# Ensures ~/.polkadot/bin is on PATH in the user's shell config.
# Called by `pnpm cli:install` after compiling the dot binary.

append_once() {
  local file="$1" line="$2"
  grep -Fqx "$line" "$file" 2>/dev/null || printf "\n%s\n" "$line" >> "$file"
}

SHELL_NAME=$(basename "$SHELL")

if [ "$SHELL_NAME" = "zsh" ]; then
  append_once "$HOME/.zshrc" 'export PATH="$HOME/.polkadot/bin:$PATH"'
  echo "Added ~/.polkadot/bin to PATH in ~/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
  append_once "$HOME/.bashrc" 'export PATH="$HOME/.polkadot/bin:$PATH"'
  append_once "$HOME/.bash_profile" '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"'
  echo "Added ~/.polkadot/bin to PATH in ~/.bashrc"
elif [ "$SHELL_NAME" = "fish" ]; then
  mkdir -p "$HOME/.config/fish"
  append_once "$HOME/.config/fish/config.fish" 'fish_add_path $HOME/.polkadot/bin'
  echo "Added ~/.polkadot/bin to PATH in fish config"
fi

echo "Restart your shell or run: export PATH=\"\$HOME/.polkadot/bin:\$PATH\""
