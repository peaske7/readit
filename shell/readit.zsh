#!/usr/bin/env zsh

# readit.zsh — Rich zsh integration for readit
#
# Provides @ file autocomplete (via fzf) and standard Tab completion.
# When you type @<partial> and press Tab inside a readit command, it
# launches an fzf picker filtered to markdown files. The selected file
# replaces the @<partial> token in the command line.
#
# Usage:
#   eval "$(readit completion zsh)"
#
# This gives you:
#   readit @<TAB>           → fzf picker for all markdown files
#   readit @test<TAB>       → fzf picker pre-filtered to "test"
#   readit @docs/<TAB>      → fzf picker pre-filtered to "docs/"
#   readit open @<TAB>      → same, works with subcommands
#   readit <TAB>            → standard subcommand/option completion

# ── Guard ──────────────────────────────────────────────────────────────
(( $+functions[_readit_plugin_loaded] )) && return 0
_readit_plugin_loaded() { :; }

# ── Tool Detection ─────────────────────────────────────────────────────
# Prefer fd for file listing (fast), fall back to find.
# Prefer bat for previews, fall back to head.

typeset -g _READIT_FD_CMD="$(command -v fdfind 2>/dev/null || command -v fd 2>/dev/null || echo '')"
if command -v bat &>/dev/null; then
  typeset -g _READIT_CAT_CMD="bat --color=always --style=numbers,changes --line-range=:40"
else
  typeset -g _READIT_CAT_CMD="head -40"
fi
typeset -g _READIT_PREVIEW_WINDOW="--preview-window=right:60%:wrap:border-sharp"

# ── File Listing ───────────────────────────────────────────────────────

# List markdown files in cwd. Uses fd if available, otherwise find.
_readit_list_files() {
  if [[ -n "$_READIT_FD_CMD" ]]; then
    $_READIT_FD_CMD --type f --hidden --exclude .git \
      --extension md --extension markdown 2>/dev/null
  else
    find . -type f \( -name '*.md' -o -name '*.markdown' \) \
      -not -path '*/.git/*' \
      -not -path '*/node_modules/*' \
      -not -path '*/.next/*' \
      -not -path '*/dist/*' \
      -not -path '*/__pycache__/*' \
      2>/dev/null | sed 's|^\./||' | sort
  fi
}

# ── fzf Wrapper ────────────────────────────────────────────────────────

_readit_fzf() {
  fzf --reverse --exact --cycle --select-1 \
    --height=~50% --no-scrollbar --ansi \
    --color="header:bold" "$@"
}

# ── Tab Completion Widget ──────────────────────────────────────────────

# The core widget: detects @<partial> in the current word and launches
# fzf to pick a markdown file. Replaces @<partial> with the selection.
function readit-completion() {
  local current_word="${LBUFFER##* }"

  # Check if the current word starts with @
  if [[ "$current_word" =~ ^@.*$ ]]; then
    # Strip the @ prefix to get the filter text
    local filter_text="${current_word#@}"
    local selected

    # Build fzf arguments with preview
    local -a fzf_args=(
      --prompt="readit> "
      --header="Select markdown file"
      --preview="if [ -f {} ]; then $_READIT_CAT_CMD {}; else echo 'Directory: {}'; ls -la {} 2>/dev/null; fi"
      $_READIT_PREVIEW_WINDOW
    )

    # Get markdown file list
    local file_list
    file_list=$(_readit_list_files)

    if [[ -z "$file_list" ]]; then
      zle -M "readit: no markdown files found"
      zle reset-prompt
      return 0
    fi

    # Launch fzf with or without an initial query
    if [[ -n "$filter_text" ]]; then
      selected=$(echo "$file_list" | _readit_fzf --query "$filter_text" "${fzf_args[@]}")
    else
      selected=$(echo "$file_list" | _readit_fzf "${fzf_args[@]}")
    fi

    # Replace @<partial> with the selected file
    if [[ -n "$selected" ]]; then
      LBUFFER="${LBUFFER%$current_word}${selected}"
    fi

    zle reset-prompt
    return 0
  fi

  # No @ prefix — fall through to standard completion
  zle expand-or-complete
}

zle -N readit-completion
bindkey '^I' readit-completion

# ── Syntax Highlighting ───────────────────────────────────────────────
# Highlight @<path> references in cyan bold (requires zsh-syntax-highlighting)

if (( $+ZSH_HIGHLIGHT_PATTERNS )); then
  ZSH_HIGHLIGHT_PATTERNS+=('@[^ ]*\.md' 'fg=cyan,bold')
  ZSH_HIGHLIGHT_PATTERNS+=('@[^ ]*\.markdown' 'fg=cyan,bold')
  ZSH_HIGHLIGHT_HIGHLIGHTERS+=(pattern)
fi

# ── Standard Completion ───────────────────────────────────────────────

# Source the compdef-based completion if it exists alongside this file
_readit_setup_completion() {
  local comp_dir="${0:A:h}"

  if [[ -f "${comp_dir}/_readit" ]]; then
    fpath=("$comp_dir" $fpath)
  fi

  autoload -Uz compinit
  if (( ! $+functions[_readit] )); then
    compinit -C 2>/dev/null
  fi
}

_readit_setup_completion

# ── Convenience ───────────────────────────────────────────────────────

alias ri='readit'
