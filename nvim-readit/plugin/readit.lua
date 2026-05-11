-- readit.nvim plugin loader
-- Auto-loaded by Neovim's plugin system

if vim.g.loaded_readit then
  return
end
vim.g.loaded_readit = true

-- The plugin is configured via require("readit").setup({...}).
-- If the user hasn't called setup() (e.g. lazy.nvim with `ft`-trigger
-- and no `config`), bootstrap with defaults on the next event-loop
-- tick so any explicit setup({...}) in user config wins, but commands
-- and keymaps still register out of the box.
vim.schedule(function()
  local ok, readit = pcall(require, "readit")
  if ok and not readit._setup_done then
    readit.setup()
  end
end)
