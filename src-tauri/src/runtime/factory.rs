use super::java::JavaProvider;
use super::mysql::MysqlProvider;
use super::nginx::NginxProvider;
use super::node::NodeProvider;
use super::php::PhpProvider;
use super::provider::{RuntimeProvider, RuntimeType};
use crate::settings::manager::AppSettings;

/// Create a runtime provider based on the runtime type
pub fn create_provider(
    runtime_type: RuntimeType,
    settings: &AppSettings,
) -> Box<dyn RuntimeProvider> {
    match runtime_type {
        RuntimeType::Php => Box::new(PhpProvider::new(
            settings.runtime_dir.clone(),
            settings.bin_dir.clone(),
        )),
        RuntimeType::Nginx => Box::new(NginxProvider::new(
            settings.runtime_dir.clone(),
            settings.bin_dir.clone(),
        )),
        RuntimeType::Mysql => Box::new(MysqlProvider::new(
            settings.runtime_dir.clone(),
            settings.bin_dir.clone(),
        )),
        RuntimeType::Java => Box::new(JavaProvider::new(
            settings.runtime_dir.clone(),
            settings.bin_dir.clone(),
        )),
        RuntimeType::Node => Box::new(NodeProvider::new(
            settings.runtime_dir.clone(),
            settings.bin_dir.clone(),
        )),
    }
}
