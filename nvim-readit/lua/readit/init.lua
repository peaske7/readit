-- readit.nvim — Neovim plugin for rendering Markdown with readit
--
-- Manages a readit server process and opens documents in the browser
-- or a split terminal. Supports live-reload: edits in Neovim are
-- reflected in the browser automatically (via readit's file watcher).

local M = {}

--- @class ReaditConfig
--- @field bun_path string Path to bun executable
--- @field port number Preferred server port (0 = auto)
--- @field host string Server host
--- @field auto_open boolean Open browser automatically
--- @field auto_reload boolean Auto-reload on BufWritePost (enabled by default via readit's fs watcher)
--- @field open_cmd string|nil Custom browser open command
--- @field keymap_prefix string Key prefix for mappings
--- @field keymaps table<string, string|false> Keymap overrides (false to disable)
--- @field float_opts table Floating window options for terminal

--- @type ReaditConfig
M.config = {
  bun_path = "bun",
  port = 0,
  host = "127.0.0.1",
  auto_open = true,
  auto_reload = true,
  open_cmd = nil,
  keymap_prefix = "<leader>r",
  keymaps = {
    open = "o",        -- Open current file in readit
    open_side = "s",   -- Open in side browser (if available)
    stop = "q",        -- Stop the server
    status = "i",      -- Show server status
    reload = "r",      -- Force reload in browser
    list = "l",        -- List commented files
  },
  float_opts = {
    relative = "editor",
    width = 0.8,
    height = 0.8,
    border = "rounded",
  },
}

--- @type number|nil
M._server_port = nil
--- @type number|nil
M._server_job_id = nil
--- @type table<string, boolean>
M._attached_files = {}

-- ── Setup ────────────────────────────────────────────────────────────

--- Setup the plugin with user configuration
--- @param opts? ReaditConfig
--- @type boolean
M._setup_done = false

function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", M.config, opts or {})
  M._setup_commands()
  M._setup_keymaps()
  M._setup_autocmds()
  M._setup_done = true
end

-- ── Server Management ────────────────────────────────────────────────

--- Discover an already-running readit server from ~/.readit/server.json
--- @return {port: number, pid: number}|nil
function M._discover_server()
  local path = vim.fn.expand("~/.readit/server.json")
  local ok, content = pcall(vim.fn.readfile, path)
  if not ok or #content == 0 then
    return nil
  end

  local decoded = vim.json.decode(table.concat(content, "\n"))
  if not decoded or not decoded.port or not decoded.pid then
    return nil
  end

  -- Check if the process is alive
  local alive = vim.fn.system("kill -0 " .. decoded.pid .. " 2>/dev/null; echo $?")
  if vim.trim(alive) ~= "0" then
    return nil
  end

  -- Health check
  local health = vim.fn.system(
    "curl -sf http://127.0.0.1:" .. decoded.port .. "/api/health 2>/dev/null"
  )
  if health == "" or vim.v.shell_error ~= 0 then
    return nil
  end

  return decoded
end

--- Start the readit server for a given file
--- @param file_path string Absolute path to the markdown file
--- @param callback? fun(port: number) Called when server is ready
function M.start_server(file_path, callback)
  -- Check for existing server first
  local existing = M._discover_server()
  if existing then
    M._server_port = existing.port
    M._attach_file(file_path, callback)
    return
  end

  -- If we already have a running job, attach to it
  if M._server_job_id and vim.fn.jobwait({ M._server_job_id }, 0)[1] == -1 then
    if M._server_port then
      M._attach_file(file_path, callback)
      return
    end
  end

  local port = M.config.port
  local args = {
    M.config.bun_path,
    "run",
    "--bun",
    vim.fn.expand("~/.readit/dist/index.js"),  -- Try installed version first
    file_path,
    "--no-open",
  }

  -- Check if the global dist exists; otherwise try npx
  if vim.fn.filereadable(vim.fn.expand("~/.readit/dist/index.js")) == 0 then
    -- Try to find readit in the project or globally
    local readit_bin = vim.fn.exepath("readit")
    if readit_bin ~= "" then
      args = { readit_bin, file_path, "--no-open" }
    else
      -- Fall back to bunx
      args = { M.config.bun_path .. "x", "@peaske7/readit", file_path, "--no-open" }
    end
  end

  if port > 0 then
    table.insert(args, "--port")
    table.insert(args, tostring(port))
  end

  vim.notify("readit: starting server...", vim.log.levels.INFO)

  M._server_job_id = vim.fn.jobstart(args, {
    on_stdout = function(_, data)
      for _, line in ipairs(data) do
        -- Parse the URL from server output
        local found_port = line:match("URL:%s*http://[^:]+:(%d+)")
        if found_port then
          M._server_port = tonumber(found_port)
          M._attached_files[file_path] = true
          vim.notify("readit: server ready on port " .. M._server_port, vim.log.levels.INFO)
          if callback then
            vim.schedule(function()
              callback(M._server_port)
            end)
          end
        end
      end
    end,
    on_stderr = function(_, data)
      for _, line in ipairs(data) do
        if line ~= "" then
          vim.notify("readit: " .. line, vim.log.levels.WARN)
        end
      end
    end,
    on_exit = function(_, code)
      M._server_job_id = nil
      M._server_port = nil
      M._attached_files = {}
      if code ~= 0 then
        vim.notify("readit: server exited with code " .. code, vim.log.levels.ERROR)
      end
    end,
    detach = false,
  })

  if M._server_job_id <= 0 then
    vim.notify("readit: failed to start server", vim.log.levels.ERROR)
    M._server_job_id = nil
  end
end

--- Attach a file to the running server via HTTP API
--- @param file_path string
--- @param callback? fun(port: number)
function M._attach_file(file_path, callback)
  if M._attached_files[file_path] then
    if callback and M._server_port then
      callback(M._server_port)
    end
    return
  end

  if not M._server_port then
    vim.notify("readit: no server running", vim.log.levels.WARN)
    return
  end

  local cmd = string.format(
    'curl -sf -X POST -H "Content-Type: application/json" -d \'{"path":"%s"}\' http://127.0.0.1:%d/api/documents 2>/dev/null',
    file_path:gsub("'", "'\\''"),
    M._server_port
  )

  vim.fn.jobstart({ "sh", "-c", cmd }, {
    on_exit = function(_, code)
      if code == 0 then
        M._attached_files[file_path] = true
        vim.schedule(function()
          if callback and M._server_port then
            callback(M._server_port)
          end
        end)
      else
        vim.schedule(function()
          vim.notify("readit: failed to attach file", vim.log.levels.ERROR)
        end)
      end
    end,
  })
end

--- Stop the readit server
function M.stop_server()
  if M._server_job_id then
    vim.fn.jobstop(M._server_job_id)
    M._server_job_id = nil
    M._server_port = nil
    M._attached_files = {}
    vim.notify("readit: server stopped", vim.log.levels.INFO)
  else
    vim.notify("readit: no server running", vim.log.levels.INFO)
  end
end

--- Get server status info
--- @return string
function M.server_status()
  if M._server_port then
    local files = vim.tbl_keys(M._attached_files)
    return string.format(
      "readit server running on port %d (%d file%s)",
      M._server_port,
      #files,
      #files == 1 and "" or "s"
    )
  end
  return "readit server not running"
end

-- ── Actions ──────────────────────────────────────────────────────────

--- Open the current markdown buffer in readit
--- @param opts? {browser?: boolean}
function M.open(opts)
  opts = opts or { browser = true }
  local bufname = vim.api.nvim_buf_get_name(0)

  if bufname == "" then
    vim.notify("readit: buffer has no file", vim.log.levels.WARN)
    return
  end

  if not bufname:match("%.md$") and not bufname:match("%.markdown$") then
    vim.notify("readit: not a markdown file", vim.log.levels.WARN)
    return
  end

  -- Save the buffer first to ensure file watcher picks up latest
  if vim.bo.modified then
    vim.cmd("write")
  end

  local file_path = vim.fn.fnamemodify(bufname, ":p")

  M.start_server(file_path, function(port)
    if opts.browser and M.config.auto_open then
      M._open_browser(port)
    end
  end)
end

--- Open the browser to the readit server
--- @param port number
function M._open_browser(port)
  local url = "http://" .. M.config.host .. ":" .. port

  if M.config.open_cmd then
    vim.fn.system(M.config.open_cmd .. " " .. vim.fn.shellescape(url))
    return
  end

  -- Platform-specific open
  local open_cmd
  if vim.fn.has("mac") == 1 then
    open_cmd = "open"
  elseif vim.fn.has("unix") == 1 then
    open_cmd = "xdg-open"
  elseif vim.fn.has("win32") == 1 then
    open_cmd = "start"
  end

  if open_cmd then
    vim.fn.jobstart({ open_cmd, url }, { detach = true })
  end
end

--- Force reload the current document in the browser
function M.reload()
  if not M._server_port then
    vim.notify("readit: no server running", vim.log.levels.WARN)
    return
  end

  -- Save first so the file watcher triggers reload
  if vim.bo.modified then
    vim.cmd("write")
  end

  vim.notify("readit: document will reload via file watcher", vim.log.levels.INFO)
end

--- List files with comments (in a floating window)
function M.list_comments()
  local comments_dir = vim.fn.expand("~/.readit/comments")
  if vim.fn.isdirectory(comments_dir) == 0 then
    vim.notify("readit: no comments found", vim.log.levels.INFO)
    return
  end

  local cmd = string.format(
    "grep -rh '^source:' %s 2>/dev/null | sed 's/^source: *//' | sort -u",
    vim.fn.shellescape(comments_dir)
  )
  local result = vim.fn.system(cmd)
  local files = vim.split(vim.trim(result), "\n", { trimempty = true })

  if #files == 0 then
    vim.notify("readit: no comments found", vim.log.levels.INFO)
    return
  end

  vim.ui.select(files, {
    prompt = "readit: files with comments",
    format_item = function(item)
      return vim.fn.fnamemodify(item, ":~:.")
    end,
  }, function(choice)
    if choice then
      vim.cmd("edit " .. vim.fn.fnameescape(choice))
      M.open()
    end
  end)
end

-- ── Commands ─────────────────────────────────────────────────────────

function M._setup_commands()
  vim.api.nvim_create_user_command("ReaditOpen", function()
    M.open()
  end, { desc = "Open current markdown file in readit" })

  vim.api.nvim_create_user_command("ReaditStop", function()
    M.stop_server()
  end, { desc = "Stop the readit server" })

  vim.api.nvim_create_user_command("ReaditStatus", function()
    vim.notify(M.server_status(), vim.log.levels.INFO)
  end, { desc = "Show readit server status" })

  vim.api.nvim_create_user_command("ReaditReload", function()
    M.reload()
  end, { desc = "Reload current document in readit" })

  vim.api.nvim_create_user_command("ReaditList", function()
    M.list_comments()
  end, { desc = "List files with readit comments" })

  vim.api.nvim_create_user_command("ReaditOpenFile", function(cmd_opts)
    local file = cmd_opts.args
    if file == "" then
      vim.notify("readit: specify a file path", vim.log.levels.WARN)
      return
    end
    local abs = vim.fn.fnamemodify(file, ":p")
    M.start_server(abs, function(port)
      if M.config.auto_open then
        M._open_browser(port)
      end
    end)
  end, {
    nargs = 1,
    complete = function(_, cmd_line, _)
      -- Complete markdown files
      local files = vim.fn.glob("**/*.md", false, true)
      local markdown_files = vim.fn.glob("**/*.markdown", false, true)
      vim.list_extend(files, markdown_files)
      return files
    end,
    desc = "Open a specific file in readit",
  })
end

-- ── Keymaps ──────────────────────────────────────────────────────────

function M._setup_keymaps()
  local prefix = M.config.keymap_prefix
  local maps = M.config.keymaps

  local function map(suffix, action, desc)
    if suffix == false then
      return
    end
    vim.keymap.set("n", prefix .. suffix, action, {
      desc = "readit: " .. desc,
      silent = true,
    })
  end

  if maps.open then
    map(maps.open, function() M.open() end, "Open in readit")
  end
  if maps.open_side then
    map(maps.open_side, function() M.open({ browser = true }) end, "Open in browser")
  end
  if maps.stop then
    map(maps.stop, function() M.stop_server() end, "Stop server")
  end
  if maps.status then
    map(maps.status, function() vim.notify(M.server_status()) end, "Server status")
  end
  if maps.reload then
    map(maps.reload, function() M.reload() end, "Reload document")
  end
  if maps.list then
    map(maps.list, function() M.list_comments() end, "List commented files")
  end
end

-- ── Autocommands ─────────────────────────────────────────────────────

function M._setup_autocmds()
  local group = vim.api.nvim_create_augroup("readit", { clear = true })

  -- Clean up server on Neovim exit
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function()
      if M._server_job_id then
        vim.fn.jobstop(M._server_job_id)
      end
    end,
  })
end

return M
