#!/usr/bin/env zsh

# readit.zsh — Rich zsh integration for readit
#
# Provides @-prefix file autocomplete using zsh's native completion menu,
# rendering markdown file matches in a multi-column [bracketed] grid
# directly below the prompt — like Forge Code / Claude Code.
#
# The heavy lifting is in the _readit compdef (shell/_readit) which uses
# compadd to render [file.md] entries. This file adds:
#   - Accept-line handler to strip @[...] brackets before execution
#   - Syntax highlighting for @[...] references (cyan bold)
#   - Completion system setup (loads _readit into fpath)
#
# Usage:
#   eval "$(readit completion zsh)"
#
# This gives you:
#   readit @<TAB>           → native multi-column grid of markdown files
#   readit @test<TAB>       → grid filtered to files matching "test"
#   readit @docs/<TAB>      → grid filtered to files matching "docs/"
#   readit open @<TAB>      → same, works with subcommands
#   readit <TAB>            → standard subcommand/option completion

# ── Guard ──────────────────────────────────────────────────────────────
(( $+functions[_readit_plugin_loaded] )) && return 0
_readit_plugin_loaded() { :; }

# ── Accept Line: Strip @[...] Brackets ────────────────────────────────
#
# When Enter is pressed, convert @[file.md] references to bare file.md
# paths before executing. This lets the bracket syntax be a visual aid
# on the prompt without affecting the actual command arguments.

function readit-accept-line() {
  if [[ "$BUFFER" == *'@['* ]]; then
    local result="" rest="$BUFFER"
    while [[ "$rest" == *'@['* ]]; do
      result+="${rest%%@\[*}"
      rest="${rest#*@\[}"
      if [[ "$rest" == *']'* ]]; then
        result+="${rest%%\]*}"
        rest="${rest#*\]}"
      else
        result+="@[${rest}"
        rest=""
      fi
    done
    result+="$rest"
    BUFFER="$result"
  fi
  zle accept-line
}

zle -N readit-accept-line
bindkey '^M' readit-accept-line
bindkey '^J' readit-accept-line

# ── Syntax Highlighting ───────────────────────────────────────────────
# Highlight @[...] references in cyan bold (requires zsh-syntax-highlighting)

if (( $+ZSH_HIGHLIGHT_PATTERNS )); then
  ZSH_HIGHLIGHT_PATTERNS+=('@\[[^\]]*\]' 'fg=cyan,bold')
  ZSH_HIGHLIGHT_HIGHLIGHTERS+=(pattern)
fi

# ── Completion Setup ──────────────────────────────────────────────────
# Load _readit compdef into fpath so Tab triggers native @ completion

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
