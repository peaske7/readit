-- readit.nvim plugin loader
-- Auto-loaded by Neovim's plugin system

if vim.g.loaded_readit then
  return
end
vim.g.loaded_readit = true

-- The plugin is configured via require("readit").setup({...})
-- Commands and keymaps are created during setup().
--
-- Minimal auto-setup: if the user hasn't called setup() and opens a
-- markdown file, register commands with defaults so :ReaditOpen works.
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "markdown" },
  once = true,
  callback = function()
    -- Only auto-setup if user hasn't already called setup()
    local readit = require("readit")
    if not readit._setup_done then
      readit.setup()
      readit._setup_done = true
    end
  end,
})
