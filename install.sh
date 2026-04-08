#!/bin/bash
set -e

DOT_DIR="$HOME/.dot"
REPO="paritytech/polkadot-apps"
BIN="dot"

# 1) Detect platform
OS=$(uname -s); case "$OS" in Linux) OS=linux;; Darwin) OS=darwin;; *) echo "Unsupported OS: $OS"; exit 1;; esac
ARCH=$(uname -m); case "$ARCH" in x86_64|amd64) ARCH=x64;; arm64|aarch64) ARCH=arm64;; *) echo "Unsupported arch: $ARCH"; exit 1;; esac
ASSET="$BIN-$OS-$ARCH"

# 2) Resolve release tag
if [ -n "$DOT_TAG" ]; then
  TAG="$DOT_TAG"
elif command -v gh >/dev/null 2>&1; then
  # Try latest non-prerelease, then fall back to newest release of any kind
  TAG=$(gh release view --repo "$REPO" --json tagName -q '.tagName' 2>/dev/null) \
    || TAG=$(gh release list --repo "$REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null) \
    || true
fi
if [ -z "$TAG" ]; then
  # Fallback: unauthenticated redirect (works for public repos only)
  TAG=$(curl -fsSI "https://github.com/$REPO/releases/latest" \
        | sed -n 's|^location:.*/tag/\(.*\)$|\1|p' | tr -d '\r' | head -n1) || true
fi
[ -z "$TAG" ] && echo "Could not determine latest release" && exit 1

# 3) Install binary
mkdir -p "$DOT_DIR/bin" "$HOME/.local/bin"
if command -v gh >/dev/null 2>&1; then
  gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --output "$DOT_DIR/bin/$BIN" --clobber
else
  curl -fsSL -L "https://github.com/$REPO/releases/download/$TAG/$ASSET" -o "$DOT_DIR/bin/$BIN"
fi
chmod +x "$DOT_DIR/bin/$BIN"
ln -sf "$DOT_DIR/bin/$BIN" "$HOME/.local/bin/$BIN"

echo "Installed $BIN ($OS/$ARCH) from $TAG -> $DOT_DIR/bin/$BIN"

# 4) Add to PATH in all available shell profiles
append_once() {
  local file="$1" line="$2"
  grep -Fqx "$line" "$file" 2>/dev/null || printf "\n%s\n" "$line" >> "$file"
}

if command -v bash >/dev/null 2>&1; then
  append_once "$HOME/.bashrc" 'export PATH="$HOME/.dot/bin:$HOME/.local/bin:$PATH"'
  append_once "$HOME/.bash_profile" '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"'
  echo "bash PATH configured"
fi

if command -v zsh >/dev/null 2>&1; then
  append_once "$HOME/.zshrc" 'export PATH="$HOME/.dot/bin:$HOME/.local/bin:$PATH"'
  echo "zsh PATH configured"
fi

if command -v fish >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/fish"
  append_once "$HOME/.config/fish/config.fish" 'fish_add_path $HOME/.dot/bin $HOME/.local/bin'
  echo "fish PATH configured"
fi

export PATH="$DOT_DIR/bin:$HOME/.local/bin:$PATH"

echo ""
echo "dot is ready! Try:"
echo -e "\033[1mdot --help\033[0m"
