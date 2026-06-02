# Zed Integration: Architecture, Design, and Implementation Plan

Status: Proposed
Date: 2026-06-02

## Goal

Add a Zed workflow for opening the current Markdown file in readit with an affordance similar to Zed's built-in Markdown Preview commands:

- `markdown: open preview`
- `markdown: open preview to the side`

The first usable milestone should work from Zed without requiring a published marketplace extension. The longer-term milestone should package the workflow as a Zed extension as far as Zed's current extension API permits.

## Context

readit already has the core pieces needed by an editor integration:

- `src/cli.ts` starts the readit server, discovers existing servers through `~/.readit/server.json`, and provides `readit open <files...>` for adding files to a running server.
- `src/server.ts` exposes `GET /api/health`, `POST /api/documents`, file watching, SSE document updates, and the full Svelte app.
- `vscode-readit/` embeds the existing readit server in a VS Code webview iframe, preserving the full browser UI without duplicating rendering or comment logic.
- `nvim-readit/` demonstrates the other integration style: run the CLI, attach files over HTTP, then open a browser.

Zed is more constrained than VS Code for this use case. Current public Zed extensions are Git repositories with an `extension.toml` manifest. Procedural extension code is Rust compiled to WebAssembly. The available extension hooks cover capabilities such as language servers, debuggers, themes, snippets, MCP servers, slash commands, docs indexing, and DAP locators. They do not currently expose a VS Code-style arbitrary webview API or a general extension-defined command-palette action that can behave exactly like `markdown::OpenPreview`.

Zed tasks are available today and can read editor context such as `$ZED_FILE`, save the current buffer, and bind task execution to a keybinding. That makes tasks the best immediate integration surface.

## Constraints

- Zed's built-in Markdown Preview actions are native Zed actions, not extension APIs.
- A marketplace extension cannot currently provide an in-editor readit preview pane equivalent to the VS Code webview implementation.
- A pure Zed task can invoke `readit` but cannot itself manage a custom preview tab or show native Zed UI beyond the task terminal behavior.
- An LSP-based extension can provide code actions for Markdown files. This is a practical bridge, but it is not as direct as a first-class command-palette action.
- readit should continue to use the existing server, storage, rendering, and SSE paths. The Zed integration should not fork the Svelte app or duplicate Markdown rendering.

## Recommended Architecture

Use a two-layer architecture:

1. A CLI integration command that is editor-agnostic and robust.
2. Zed-specific invocation surfaces that call that CLI command.

```text
Zed keybinding / task / code action
  -> readit zed-open <absolute markdown path>
    -> discover running readit server
    -> attach file with POST /api/documents or start server
    -> open browser to http://127.0.0.1:<port>
      -> existing readit Svelte app
        -> comments in ~/.readit/comments/
```

### Components

#### 1. `readit zed-open <file>`

Purpose: provide a short-lived command designed for editor integrations.

Responsibilities:

- Resolve and validate the input path.
- Require `.md` or `.markdown`.
- Save no editor state itself. The caller, such as a Zed task, is responsible for saving the active buffer first.
- Discover an existing readit server using the same `~/.readit/server.json` plus `GET /api/health` approach already used by `readit open`.
- If a server exists, attach the file with `POST /api/documents`.
- If no server exists, start a detached or background server for the file.
- Open the readit URL in the system browser.
- Exit after launch, so Zed tasks do not need to keep a terminal process alive.

This command is intentionally separate from `readit open`. `readit open` is useful as an interactive CLI command and can run a foreground server. `readit zed-open` should be optimized for editor invocation: quick return, stable stdout/stderr, and predictable failure messages.

#### 2. Zed task integration

Purpose: immediate working UX without waiting on marketplace extension constraints.

Project-local `.zed/tasks.json`:

```json
[
  {
    "label": "readit: open preview",
    "command": "readit",
    "args": ["zed-open", "$ZED_FILE"],
    "save": "current",
    "reveal": "never",
    "hide": "on_success"
  }
]
```

User keybinding:

```json
{
  "context": "Workspace",
  "bindings": {
    "cmd-shift-r": ["task::Spawn", { "task_name": "readit: open preview" }]
  }
}
```

This is the fastest path to a Markdown Preview-like workflow:

1. Open a Markdown file in Zed.
2. Press the configured keybinding.
3. Zed saves the current buffer.
4. readit opens or updates the browser review UI.

#### 3. Future `zed-readit` extension

Purpose: marketplace-installable integration that surfaces readit from Zed UI without requiring each project to define `.zed/tasks.json`.

The extension should use an LSP bridge because this is the most practical currently available Zed extension surface for file-local actions.

```text
zed-readit/
  extension.toml
  Cargo.toml
  src/lib.rs
```

The Rust/WASM extension registers a Markdown language server:

```toml
id = "readit"
name = "readit"
version = "0.0.1"
schema_version = 1
authors = ["Jay Shimada <peaske@pm.me>"]
description = "Open Markdown files in readit for inline review comments"
repository = "https://github.com/peaske7/readit"

[language_servers.readit]
name = "readit"
languages = ["Markdown"]
```

The language server implementation can be shipped as either:

- a subcommand of the main CLI, `readit zed-lsp`, or
- a small standalone binary, `readit-zed-lsp`, distributed through GitHub releases.

The LSP should:

- Attach only to Markdown buffers.
- Provide code actions:
  - `readit: Open Preview`
  - `readit: Open Preview in Browser`
- Execute the action by spawning `readit zed-open <file>`.
- Report clear diagnostics if `readit` or Bun is missing.

The Zed Rust extension should:

- Locate `readit` in the user's `PATH` via Zed's worktree APIs where possible.
- Optionally install/download the helper if using a standalone LSP binary.
- Return the command used to start the LSP from `language_server_command`.
- Avoid reading or mutating user environment outside Zed's extension APIs.

## Design Decisions

### Use the browser for the preview surface

Do not attempt to recreate the readit UI inside Zed for v1. readit already has an interactive browser app with selection, comments, margin notes, SSE reload, settings, export, and raw comment viewing. Reimplementing this in native Zed UI is not possible with current public APIs and would add a second frontend.

### Add a purpose-built editor command instead of overloading `readit open`

`readit open` is close, but its current behavior is CLI-centric. A Zed task needs an invocation that starts or attaches, opens the URL, and exits cleanly. That makes `readit zed-open` a small but useful integration boundary.

### Keep server ownership in readit

The Zed integration should not own server lifecycle deeply. It should ask the CLI to start or attach. This keeps lock files, port selection, file watchers, SSE, cleanup, and comments in the existing code paths.

### Treat the LSP extension as an affordance layer

The future extension should not become a second implementation of readit. It should only discover the current document and call the CLI. This minimizes breakage when Zed's extension API changes and keeps the extension publishable.

## Implementation Plan

### Phase 1: CLI command for Zed tasks

Files:

- `src/cli.ts`
- `README.md`
- optional: `docs/plans/2026-06-02-zed-extension-design.md`

Steps:

1. Add `readit zed-open <file>` to `src/cli.ts`.
2. Reuse existing path validation helpers where possible.
3. Reuse existing server discovery logic:
   - read `~/.readit/server.json`
   - verify PID
   - health check `GET /api/health`
4. If a healthy server exists:
   - call `POST /api/documents`
   - open `http://127.0.0.1:<port>`
   - exit `0`
5. If no healthy server exists:
   - start a server for the file
   - open the URL
   - detach or keep a lightweight background process so the Zed task can return
6. Add stable user-facing errors:
   - unsupported file type
   - file not found
   - Bun missing
   - failed to start server
7. Document the Zed task and keybinding snippets.

Open design question for this phase:

- Bun child process management: decide whether `zed-open` should spawn `bun dist/index.js ... --no-open` detached, or whether the main CLI should gain a reusable background-start helper.

Recommendation: extract a helper for starting a background readit server so future editor integrations can share it.

### Phase 2: Project-local Zed setup

Files:

- `README.md`
- optionally `.zed/tasks.json` as an example only if this repo should dogfood it

Steps:

1. Add a "Zed" section to `README.md`.
2. Include `.zed/tasks.json` snippet.
3. Include `keymap.json` snippet.
4. Explain that the preview opens in the browser because Zed extensions do not yet support arbitrary preview webviews.
5. Add troubleshooting:
   - verify `readit` is on `PATH`
   - verify Bun is installed
   - run `readit zed-open README.md` manually
   - inspect `~/.readit/server.json`

### Phase 3: LSP bridge prototype

Files:

- new: `zed-readit/extension.toml`
- new: `zed-readit/Cargo.toml`
- new: `zed-readit/src/lib.rs`
- new: `src/zed-lsp.ts` or separate package if using TypeScript/Bun for the helper

Steps:

1. Create `zed-readit` extension manifest.
2. Implement Rust extension with `zed_extension_api`.
3. Register `readit` as a Markdown language server.
4. Implement `language_server_command` to launch `readit zed-lsp`.
5. Implement a minimal LSP server:
   - `initialize`
   - `textDocument/codeAction`
   - `workspace/executeCommand`
   - shutdown/exit
6. Code action returns `readit: Open Preview` for Markdown documents.
7. Execute command calls `readit zed-open <uri file path>`.
8. Add logs that surface missing `readit`, missing Bun, and launch failures.
9. Install as a Zed dev extension and test on Markdown files.

### Phase 4: Packaging and publishing

Steps:

1. Decide repository layout:
   - keep `zed-readit/` in this monorepo, or
   - publish a dedicated `readit-zed` repository.
2. Ensure extension path contains a valid accepted license.
3. If publishing from a monorepo subdirectory, configure the Zed extensions registry entry with `path = "zed-readit"`.
4. Add release automation if a standalone LSP binary is used.
5. Submit PR to `zed-industries/extensions` once local dev extension testing is solid.

## Verification Plan

### CLI

1. `readit zed-open README.md`
2. Confirm browser opens.
3. Confirm `~/.readit/server.json` exists and points to a healthy server.
4. Run `readit zed-open test.md`.
5. Confirm the existing server receives the second document rather than spawning a duplicate server.
6. Edit the Markdown file in Zed and save.
7. Confirm readit live reloads.

### Zed task

1. Add the task snippet to `.zed/tasks.json`.
2. Bind a key to `task::Spawn`.
3. Open a Markdown file in Zed.
4. Modify it without saving.
5. Invoke the task.
6. Confirm Zed saves the current buffer before readit opens.
7. Confirm terminal is not left focused after a successful launch.

### LSP bridge

1. Install `zed-readit` as a dev extension using `zed: install dev extension`.
2. Open Zed from the terminal with `zed --foreground` for logs.
3. Open a Markdown file.
4. Trigger code actions.
5. Confirm `readit: Open Preview` appears.
6. Execute it.
7. Confirm readit opens the expected file.
8. Remove `readit` from `PATH` and confirm the error is actionable.

## Risks

- Zed task invocation is less discoverable than a built-in command-palette action.
- LSP code actions are an indirect affordance and may feel different from Markdown Preview.
- Detached server startup must be handled carefully to avoid orphaned processes or stale `server.json` entries.
- If the user installed readit through a package manager that does not expose a stable `readit` binary to Zed's environment, task execution can fail.
- Remote Zed sessions may need separate handling because the server and browser may live on different machines.

## Non-goals

- Reimplementing readit's Svelte UI as native Zed UI.
- Replacing Zed's built-in Markdown Preview.
- Providing a full in-editor webview before Zed exposes a suitable extension API.
- Supporting non-Markdown files in the first Zed integration.

## References

- Zed developing extensions: https://zed.dev/docs/extensions/developing-extensions
- Zed extension API trait: https://docs.rs/zed_extension_api/latest/zed_extension_api/trait.Extension.html
- Zed actions list: https://zed.dev/docs/all-actions
- Zed tasks: https://zed.dev/docs/tasks
- Zed live-server extension precedent: https://github.com/frederik-uni/zed-live-server
