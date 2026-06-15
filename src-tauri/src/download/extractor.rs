use std::fs::File;
use std::path::Path;

#[cfg(target_os = "macos")]
use crate::core::platform::PlatformOps;
use crate::core::AppError;

/// Archive extractor supporting tar.gz and zip
pub struct ArchiveExtractor;

impl ArchiveExtractor {
    /// Extract an archive to the destination directory
    pub fn extract(archive_path: &Path, dest_dir: &Path) -> Result<(), AppError> {
        let extension = archive_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let file_name = archive_path
            .file_name()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") || extension == "gz" {
            Self::extract_tar_gz(archive_path, dest_dir)?;
        } else if extension == "zip" {
            Self::extract_zip(archive_path, dest_dir)?;
        } else {
            return Err(AppError::Other(format!(
                "Unsupported archive format: {}",
                file_name
            )));
        }

        Ok(())
    }

    fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), AppError> {
        let file = File::open(archive_path)?;
        let gz = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(gz);

        archive.unpack(dest_dir)?;

        Ok(())
    }

    fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), AppError> {
        let file = File::open(archive_path)?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| AppError::Archive(e.to_string()))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| AppError::Archive(e.to_string()))?;
            let outpath = dest_dir.join(file.mangled_name());

            if file.name().ends_with('/') {
                std::fs::create_dir_all(&outpath)?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut outfile = File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }

            // Set permissions on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode))?;
                }
            }
        }

        Ok(())
    }

    /// Sign all binaries in a directory (macOS ad-hoc signing)
    pub fn sign_binaries(dir: &Path) -> Result<(), AppError> {
        #[cfg(not(target_os = "macos"))]
        let _ = dir;

        #[cfg(target_os = "macos")]
        {
            Self::sign_binaries_recursive(dir)?;
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn sign_binaries_recursive(dir: &Path) -> Result<(), AppError> {
        use std::fs;

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                Self::sign_binaries_recursive(&path)?;
            } else if path.is_file() {
                // Check if file is executable
                let metadata = fs::metadata(&path)?;
                let permissions = metadata.permissions();
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if permissions.mode() & 0o111 != 0 {
                        PlatformOps::sign_binary(&path)?;
                    }
                }
            }
        }

        Ok(())
    }
}
