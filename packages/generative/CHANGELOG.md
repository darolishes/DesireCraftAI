# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2024-01-26

### Added

- Custom model configuration support
  - Fine-grained control over model parameters
  - Resource usage limits
  - Performance optimization settings
  - GPU and CPU configuration
  - Model quantization options
- New configuration validation with Zod
- Configuration persistence across model reloads
- Documentation for model configuration
- Best practices for different hardware setups

### Changed

- Enhanced model management interface
- Improved configuration validation
- Updated model loading process
- Extended documentation with configuration examples

### Fixed

- Model configuration persistence
- Configuration validation edge cases
- Resource limit enforcement

## [0.2.0] - 2024-01-26

### Added

- Comprehensive model management system
  - Model configuration and capabilities tracking
  - Model status monitoring
  - Preloading and unloading functionality
  - Memory usage tracking
  - Model validation in generation requests
- New interfaces for model management
  - `ModelConfig` for model capabilities
  - `ModelStatus` for runtime status
  - `ModelManager` for management operations
- Enhanced error handling for model operations
- Documentation for model management features
- Best practices for model resource management

### Changed

- Improved model validation in generation requests
- Enhanced error messages for model-related issues
- Updated documentation with model management examples

### Fixed

- Model loading state tracking
- Memory usage calculation
- Error handling for non-existent models

## [0.1.0] - 2024-01-26

### Added

- Initial release with core functionality
- Basic text generation with Ollama integration
- Streaming support with token-by-token output
- Configurable options (temperature, top-p, etc.)
- Input validation with Zod
- Type-safe interfaces
- Comprehensive error handling
  - Specific error types for different failure cases
  - Retry logic with exponential backoff
  - Error context and serialization
- Structured logging system
  - Multiple log levels (debug, info, warn, error)
  - Performance metrics logging
  - Dependency injection for logger
- Test suite
  - Unit tests for core functionality
  - Mock implementation for Ollama
  - Test coverage for error cases
  - Streaming test cases

### Changed

- N/A (initial release)

### Deprecated

- N/A (initial release)

### Removed

- N/A (initial release)

### Fixed

- N/A (initial release)

### Security

- N/A (initial release)
