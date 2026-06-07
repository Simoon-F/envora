use std::path::Path;
use std::process::Command;

use super::AppError;

/// Cross-platform operations abstraction
pub struct PlatformOps;

impl PlatformOps {
    /// Create a shell command appropriate for the current platform
    pub fn shell_command(cmd: &str) -> Command {
        #[cfg(target_os = "macos")]
        {
            let mut command = Command::new("bash");
            command.args(["-c", cmd]);
            command
        }

        #[cfg(target_os = "windows")]
        {
            let mut command = Command::new("cmd");
            command.args(["/C", cmd]);
            command
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let mut command = Command::new("sh");
            command.args(["-c", cmd]);
            command
        }
    }

    /// Ad-hoc sign a binary (macOS only, no-op on other platforms)
    pub fn sign_binary(path: &Path) -> Result<(), AppError> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("codesign")
                .args(["--force", "--sign", "-", path.to_str().unwrap_or("")])
                .output()?;

            if !output.status.success() {
                return Err(AppError::Other(format!(
                    "codesign failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
        }

        Ok(())
    }

    /// Create a symlink (macOS) or hard link (Windows)
    pub fn create_link(original: &Path, link: &Path) -> Result<(), AppError> {
        // Remove existing link if it exists
        if link.exists() {
            std::fs::remove_file(link)?;
        }

        #[cfg(target_os = "macos")]
        {
            std::os::unix::fs::symlink(original, link)?;
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, use hard link for files (doesn't require admin)
            std::fs::hard_link(original, link)?;
        }

        Ok(())
    }

    /// Check if Xcode Command Line Tools are installed (macOS)
    pub fn check_build_tools() -> Result<(), AppError> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("xcode-select")
                .arg("-p")
                .output()?;

            if !output.status.success() {
                return Err(AppError::DependencyMissing(
                    "Xcode Command Line Tools not found. Install with: xcode-select --install"
                        .to_string(),
                ));
            }
        }

        #[cfg(target_os = "windows")]
        {
            // Check for Visual Studio Build Tools
            let output = Command::new("where").arg("cl.exe").output();
            match output {
                Ok(o) if o.status.success() => {}
                _ => {
                    return Err(AppError::DependencyMissing(
                        "Visual Studio Build Tools not found. Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
                            .to_string(),
                    ));
                }
            }
        }

        Ok(())
    }

    /// Get the number of CPU cores for parallel compilation
    pub fn num_cpus() -> usize {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    }
}
