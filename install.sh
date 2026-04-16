#!/bin/bash
set -e

DOT_DIR="$HOME/.polkadot"
REPO="paritytech/polkadot-apps"
BIN="dot"

# 1) Detect platform
OS=$(uname -s); case "$OS" in Linux) OS=linux;; Darwin) OS=darwin;; *) echo "Unsupported OS: $OS"; exit 1;; esac
ARCH=$(uname -m); case "$ARCH" in x86_64|amd64) ARCH=x64;; arm64|aarch64) ARCH=arm64;; *) echo "Unsupported arch: $ARCH"; exit 1;; esac
ASSET="$BIN-$OS-$ARCH"

# 2) Resolve release tag
if [ -n "$DOT_TAG" ]; then
  TAG="$DOT_TAG"
else
  # Try latest stable release first
  TAG=$(curl -fsSI "https://github.com/$REPO/releases/latest" \
        | sed -n 's|^location:.*/tag/\(.*\)$|\1|p' | tr -d '\r' | head -n1) || true
  # Fall back to newest release of any kind (including pre-releases)
  if [ -z "$TAG" ]; then
    TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=1" \
          | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1) || true
  fi
fi
[ -z "$TAG" ] && echo "Could not determine latest release" && exit 1

# 3) Install binary
mkdir -p "$DOT_DIR/bin" "$HOME/.local/bin"
curl -fsSL "https://github.com/$REPO/releases/download/$TAG/$ASSET" -o "$DOT_DIR/bin/$BIN"
chmod +x "$DOT_DIR/bin/$BIN"
if [ "$OS" = "darwin" ]; then
  # Ad-hoc sign — Apple Silicon requires at least this to run a binary
  codesign --sign - --force "$DOT_DIR/bin/$BIN" 2>/dev/null || true
  # Strip quarantine/provenance xattrs
  xattr -c "$DOT_DIR/bin/$BIN" 2>/dev/null || true
fi
ln -sf "$DOT_DIR/bin/$BIN" "$HOME/.local/bin/$BIN"

echo "Installed $BIN ($OS/$ARCH) from $TAG -> $DOT_DIR/bin/$BIN"

# 4) Add to PATH in all available shell profiles
append_once() {
  local file="$1" line="$2"
  grep -Fqx "$line" "$file" 2>/dev/null || printf "\n%s\n" "$line" >> "$file"
}

if command -v bash >/dev/null 2>&1; then
  append_once "$HOME/.bashrc" 'export PATH="$HOME/.polkadot/bin:$HOME/.local/bin:$PATH"'
  append_once "$HOME/.bash_profile" '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"'
  echo "bash PATH configured"
fi

if command -v zsh >/dev/null 2>&1; then
  append_once "$HOME/.zshrc" 'export PATH="$HOME/.polkadot/bin:$HOME/.local/bin:$PATH"'
  echo "zsh PATH configured"
fi

if command -v fish >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/fish"
  append_once "$HOME/.config/fish/config.fish" 'fish_add_path $HOME/.polkadot/bin $HOME/.local/bin'
  echo "fish PATH configured"
fi

export PATH="$DOT_DIR/bin:$HOME/.local/bin:$PATH"

echo ""
echo -e "dot is ready! Running: \033[1mdot init\033[0m"
echo ""
"$DOT_DIR/bin/$BIN" init
