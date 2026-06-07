use std::process::Command;

use crate::core::AppError;

/// Check if required build tools are available
pub fn check_build_tools() -> Result<(), AppError> {
    // Check for C compiler
    let has_cc = Command::new("cc").arg("--version").output().is_ok()
        || Command::new("gcc").arg("--version").output().is_ok()
        || Command::new("clang").arg("--version").output().is_ok();

    if !has_cc {
        return Err(AppError::DependencyMissing(
            "C compiler not found. Install Xcode Command Line Tools (macOS) or Visual Studio Build Tools (Windows).".to_string()
        ));
    }

    // Check for make
    let has_make = Command::new("make").arg("--version").output().is_ok();
    if !has_make {
        return Err(AppError::DependencyMissing(
            "make not found. Install Xcode Command Line Tools.".to_string(),
        ));
    }

    Ok(())
}

/// Check PHP build dependencies
pub fn check_php_deps() -> Result<(), AppError> {
    check_build_tools()?;

    // Check for autoconf (needed for PHP)
    let has_autoconf = Command::new("autoconf").arg("--version").output().is_ok();
    if !has_autoconf {
        return Err(AppError::DependencyMissing(
            "autoconf not found. Install with: brew install autoconf".to_string(),
        ));
    }

    Ok(())
}

/// Check Nginx build dependencies
pub fn check_nginx_deps() -> Result<(), AppError> {
    check_build_tools()?;

    // Check for pcre
    let has_pcre = Command::new("pcre2-config").arg("--version").output().is_ok()
        || Command::new("pkg-config").args(["--exists", "libpcre"]).output().is_ok();

    if !has_pcre {
        tracing::warn!("pcre not found, nginx may need --without-pcre");
    }

    Ok(())
}
