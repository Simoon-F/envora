use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::core::AppError;

/// Progress callback type
pub type ProgressCallback = Box<dyn Fn(f64, u64, u64) + Send + Sync>;

/// Download manager with progress reporting
pub struct DownloadManager;

impl DownloadManager {
    /// Download a file with progress reporting
    pub async fn download(
        url: &str,
        dest: &Path,
        on_progress: Option<ProgressCallback>,
    ) -> Result<PathBuf, AppError> {
        // Use a curl-like User-Agent to avoid CDN blocks (MySQL CDN blocks reqwest's default UA)
        let client = reqwest::Client::builder()
            .user_agent("curl/8.7.1")
            .build()
            .map_err(|e| AppError::Download(e.to_string()))?;
        let response = client.get(url).send().await?;

        if !response.status().is_success() {
            return Err(AppError::Download(format!(
                "HTTP {}: {}",
                response.status(),
                url
            )));
        }

        let total_bytes = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        let mut file = tokio::fs::File::create(dest).await?;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| AppError::Download(e.to_string()))?;
            file.write_all(&chunk).await?;

            downloaded += chunk.len() as u64;

            if let Some(ref callback) = on_progress {
                let percent = if total_bytes > 0 {
                    (downloaded as f64 / total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                callback(percent, downloaded, total_bytes);
            }
        }

        file.flush().await?;

        Ok(dest.to_path_buf())
    }

    /// Download with SHA256 verification
    pub async fn download_with_checksum(
        url: &str,
        dest: &Path,
        expected_sha256: Option<&str>,
        on_progress: Option<ProgressCallback>,
    ) -> Result<PathBuf, AppError> {
        let path = Self::download(url, dest, on_progress).await?;

        if let Some(expected) = expected_sha256 {
            use sha2::{Digest, Sha256};

            let content = tokio::fs::read(&path).await?;
            let hash = Sha256::digest(&content);
            let actual = hex::encode(hash);

            if actual != expected {
                // Remove invalid file
                let _ = tokio::fs::remove_file(&path).await;
                return Err(AppError::Download(format!(
                    "SHA256 mismatch: expected {}, got {}",
                    expected, actual
                )));
            }
        }

        Ok(path)
    }
}
