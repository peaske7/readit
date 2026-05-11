-- Health check for readit.nvim
-- Run with :checkhealth readit

local M = {}

function M.check()
  vim.health.start("readit.nvim")

  -- Check bun
  local readit = require("readit")
  local bun_path = readit.config.bun_path or "bun"
  local bun_exec = vim.fn.exepath(bun_path)

  if bun_exec ~= "" then
    local version = vim.fn.system(bun_path .. " --version")
    vim.health.ok("bun found: " .. vim.trim(version) .. " (" .. bun_exec .. ")")
  else
    vim.health.error(
      "bun not found",
      { "Install Bun: https://bun.sh", "Or set bun_path in setup()" }
    )
  end

  -- Check readit CLI
  local readit_exec = vim.fn.exepath("readit")
  if readit_exec ~= "" then
    vim.health.ok("readit CLI found: " .. readit_exec)
  else
    local dist = vim.fn.expand("~/.readit/dist/index.js")
    if vim.fn.filereadable(dist) == 1 then
      vim.health.ok("readit dist found: " .. dist)
    else
      vim.health.warn(
        "readit CLI not in PATH",
        { "Install: npm install -g @peaske7/readit", "Or: bun add -g @peaske7/readit" }
      )
    end
  end

  -- Check curl (needed for server communication)
  if vim.fn.exepath("curl") ~= "" then
    vim.health.ok("curl found")
  else
    vim.health.error("curl not found (required for server API calls)")
  end

  -- Check server status
  if readit._server_port then
    vim.health.ok("Server running on port " .. readit._server_port)
  else
    vim.health.info("Server not running (will start on :ReaditOpen)")
  end

  -- Check for comments directory
  local comments_dir = vim.fn.expand("~/.readit/comments")
  if vim.fn.isdirectory(comments_dir) == 1 then
    local count = #vim.fn.glob(comments_dir .. "/**/*.comments.md", false, true)
    vim.health.ok("Comments directory exists (" .. count .. " comment files)")
  else
    vim.health.info("No comments directory yet (~/.readit/comments/)")
  end
end

return M
