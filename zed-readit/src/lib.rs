use std::{env, fs};

use zed_extension_api as zed;

const PACKAGE_NAME: &str = "@peaske7/readit";
const READIT_VERSION: &str = "0.3.3-rc.2";
const SERVER_PATH: &str = "node_modules/@peaske7/readit/dist/index.js";
const DEV_ENTRYPOINT: &str = "../dist/index.js";

struct ReaditExtension {
    did_find_server: bool,
}

impl ReaditExtension {
    fn server_exists(&self) -> bool {
        fs::metadata(SERVER_PATH).is_ok_and(|stat| stat.is_file())
    }

    fn dev_entrypoint(&self) -> Option<String> {
        if !fs::metadata(DEV_ENTRYPOINT).is_ok_and(|stat| stat.is_file()) {
            return None;
        }

        Some(
            env::current_dir()
                .ok()?
                .join(DEV_ENTRYPOINT)
                .to_string_lossy()
                .to_string(),
        )
    }

    fn ensure_readit_entrypoint(
        &mut self,
        language_server_id: &zed::LanguageServerId,
    ) -> zed::Result<String> {
        if let Some(dev_entrypoint) = self.dev_entrypoint() {
            return Ok(dev_entrypoint);
        }

        let server_exists = self.server_exists();
        if self.did_find_server && server_exists {
            return Ok(self.server_script_path()?);
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        if !server_exists
            || zed::npm_package_installed_version(PACKAGE_NAME)?.as_deref()
                != Some(READIT_VERSION)
        {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );

            let result = zed::npm_install_package(PACKAGE_NAME, READIT_VERSION);
            match result {
                Ok(()) => {
                    if !self.server_exists() {
                        return Err(format!(
                            "installed package '{PACKAGE_NAME}' did not contain expected path '{SERVER_PATH}'"
                        ));
                    }
                }
                Err(error) => {
                    if !self.server_exists() {
                        return Err(error);
                    }
                }
            }
        }

        self.did_find_server = true;
        self.server_script_path()
    }

    fn server_script_path(&self) -> zed::Result<String> {
        Ok(env::current_dir()
            .map_err(|err| err.to_string())?
            .join(SERVER_PATH)
            .to_string_lossy()
            .to_string())
    }
}

impl zed::Extension for ReaditExtension {
    fn new() -> Self {
        Self {
            did_find_server: false,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let bun = worktree.which("bun").ok_or_else(|| {
            "bun was not found on PATH. Install Bun (https://bun.sh) and ensure it is available to Zed."
                .to_string()
        })?;

        let entrypoint = self.ensure_readit_entrypoint(language_server_id)?;

        Ok(zed::Command {
            command: bun,
            args: vec![entrypoint, "zed-lsp".to_string()],
            env: worktree.shell_env(),
        })
    }
}

zed::register_extension!(ReaditExtension);
