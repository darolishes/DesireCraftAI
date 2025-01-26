# Architecture

This document describes the technical architecture of the @desirecraftai/generative package.

## Overview

The package is designed with the following principles:

- Clean separation of concerns
- Type safety and validation
- Robust error handling
- Extensible logging
- Performance optimization

## Core Components

### GenerativeClient

The main client class that handles:

- Connection management with Ollama
- Request validation and processing
- Error handling and retries
- Streaming support
- Performance monitoring

```mermaid
classDiagram
    class GenerativeClient {
        -Ollama ollama
        -Logger logger
        -number maxRetries
        -number baseRetryDelay
        +constructor(options: ClientOptions)
        +generate(options: GenerateOptions): Promise<string>
        -sleep(ms: number): Promise<void>
        -isRetryableError(error: unknown): boolean
    }
    class ClientOptions {
        +string? host
        +number? maxRetries
        +number? baseRetryDelay
        +Logger? logger
    }
    class GenerateOptions {
        +string prompt
        +string? model
        +number[]? context
        +number? temperature
        +number? topP
        +string? system
        +boolean? stream
    }
    GenerativeClient ..> ClientOptions
    GenerativeClient ..> GenerateOptions
```

### Error Handling

A hierarchical error system:

```mermaid
classDiagram
    class Error {
        +string message
        +string name
    }
    class GenerativeError {
        +GenerativeErrorCode code
        +unknown? cause
        +Record<string, unknown>? context
        +toJSON(): object
    }
    Error <|-- GenerativeError
```

### Logging System

Flexible logging architecture:

```mermaid
classDiagram
    class Logger {
        +debug(message: string, context?: object)
        +info(message: string, context?: object)
        +warn(message: string, context?: object)
        +error(message: string, error?: Error, context?: object)
    }
    class ConsoleLogger {
        +debug(message: string, context?: object)
        +info(message: string, context?: object)
        +warn(message: string, context?: object)
        +error(message: string, error?: Error, context?: object)
    }
    Logger <|.. ConsoleLogger
```

## Request Flow

1. **Initialization**

   ```mermaid
   sequenceDiagram
       participant App
       participant Client
       participant Ollama
       App->>Client: new GenerativeClient(options)
       Client->>Ollama: Connect
       Ollama-->>Client: Connected
       Client-->>App: Ready
   ```

2. **Generation Request**

   ```mermaid
   sequenceDiagram
       participant App
       participant Client
       participant Validator
       participant Ollama
       App->>Client: generate(options)
       Client->>Validator: validateGenerateOptions(options)
       Validator-->>Client: validatedOptions
       Client->>Ollama: generate(request)
       Ollama-->>Client: response
       Client-->>App: result
   ```

3. **Streaming Request**
   ```mermaid
   sequenceDiagram
       participant App
       participant Client
       participant Ollama
       participant Handler
       App->>Client: generate(options, streamHandler)
       Client->>Ollama: generate(request, stream: true)
       loop For each token
           Ollama-->>Client: token
           Client->>Handler: onToken(token)
       end
       Client->>Handler: onComplete(response)
       Client-->>App: fullResponse
   ```

## Error Flow

```mermaid
sequenceDiagram
    participant App
    participant Client
    participant Ollama
    participant RetryLogic
    App->>Client: generate(options)
    Client->>Ollama: Request
    Ollama-->>Client: Error
    Client->>RetryLogic: isRetryableError(error)
    alt Retryable
        RetryLogic-->>Client: true
        Client->>Client: Wait with exponential backoff
        Client->>Ollama: Retry request
    else Non-retryable
        RetryLogic-->>Client: false
        Client->>Client: Create GenerativeError
        Client-->>App: Throw error
    end
```

## Performance Considerations

1. **Memory Management**

   - Context tokens are managed efficiently
   - Streaming reduces memory footprint
   - Resources are cleaned up properly

2. **Network Optimization**

   - Retries with exponential backoff
   - Connection reuse
   - Efficient error handling

3. **Validation**
   - Input validation before requests
   - Type checking at compile time
   - Runtime schema validation

## Future Extensions

The architecture is designed to be extensible for:

- Additional LLM providers
- Caching layers
- Request batching
- Model management
- Advanced monitoring
