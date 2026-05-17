#!/bin/sh
# Claude Code status line: cwd | model | context % | git branch

input=$(cat)

# Current working directory
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')

# Model display name
model=$(echo "$input" | jq -r '.model.display_name // ""')

# Context window usage percentage
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$used_pct" ]; then
  ctx_str=$(printf "ctx:%.0f%%" "$used_pct")
else
  ctx_str="ctx:--"
fi

# Git branch (skip optional locks to avoid conflicts)
git_branch=""
if [ -n "$cwd" ] && command -v git >/dev/null 2>&1; then
  git_branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi

# Build status line with ANSI colors (dimmed-friendly)
# Format: [cwd]  model  ctx%  branch
if [ -n "$git_branch" ]; then
  printf "\033[34m%s\033[0m  \033[33m%s\033[0m  \033[36m%s\033[0m  \033[32m%s\033[0m" \
    "$cwd" "$model" "$ctx_str" "$git_branch"
else
  printf "\033[34m%s\033[0m  \033[33m%s\033[0m  \033[36m%s\033[0m" \
    "$cwd" "$model" "$ctx_str"
fi
