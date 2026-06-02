use zed_extension_api as zed;

struct ReaditExtension;

impl zed::Extension for ReaditExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let readit = worktree.which("readit").ok_or_else(|| {
            "readit was not found on PATH. Install it with `bun add -g @peaske7/readit`, `npm install -g @peaske7/readit`, or ensure your shell PATH is available to Zed."
                .to_string()
        })?;

        Ok(zed::Command {
            command: readit,
            args: vec!["zed-lsp".to_string()],
            env: worktree.shell_env(),
        })
    }
}

zed::register_extension!(ReaditExtension);
