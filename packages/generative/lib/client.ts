import { Ollama } from "ollama";
import {
	type GenerateOptions,
	type StreamHandler,
	validateGenerateOptions,
} from "../types";

export enum GenerativeErrorCode {
	INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
	GENERATION_FAILED = "GENERATION_FAILED",
	INVALID_MODEL = "INVALID_MODEL",
	RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
	VALIDATION_FAILED = "VALIDATION_FAILED",
	NETWORK_ERROR = "NETWORK_ERROR",
	STREAM_ERROR = "STREAM_ERROR",
}

// Simple logger interface for dependency injection
export interface Logger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(
		message: string,
		error?: Error,
		context?: Record<string, unknown>,
	): void;
}

// Default console logger implementation
export class ConsoleLogger implements Logger {
	debug(message: string, context?: Record<string, unknown>) {
		console.debug(message, context);
	}
	info(message: string, context?: Record<string, unknown>) {
		console.info(message, context);
	}
	warn(message: string, context?: Record<string, unknown>) {
		console.warn(message, context);
	}
	error(message: string, error?: Error, context?: Record<string, unknown>) {
		console.error(message, error, context);
	}
}

export class GenerativeError extends Error {
	constructor(
		message: string,
		public code: GenerativeErrorCode,
		public cause?: unknown,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "GenerativeError";
	}

	public toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			context: this.context,
			cause: this.cause instanceof Error ? this.cause.message : this.cause,
		};
	}
}

interface ClientOptions {
	/** Host URL for Ollama API */
	host?: string;
	/** Maximum number of retry attempts */
	maxRetries?: number;
	/** Base delay for exponential backoff in ms */
	baseRetryDelay?: number;
	/** Logger instance */
	logger?: Logger;
}

export class GenerativeClient {
	private ollama: Ollama;
	private maxRetries: number;
	private baseRetryDelay: number;
	private logger: Logger;

	constructor(options: ClientOptions = {}) {
		const {
			host = process.env.OLLAMA_HOST || "http://localhost:11434",
			maxRetries = 3,
			baseRetryDelay = 1000,
			logger = new ConsoleLogger(),
		} = options;

		this.logger = logger;
		this.maxRetries = maxRetries;
		this.baseRetryDelay = baseRetryDelay;

		try {
			this.ollama = new Ollama({ host });
			this.logger.info("GenerativeClient initialized", { host });
		} catch (error) {
			const generativeError = new GenerativeError(
				"Failed to initialize Ollama client",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error instanceof Error ? error : new Error(String(error)),
			);
			this.logger.error("Failed to initialize client", generativeError);
			throw generativeError;
		}
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private isRetryableError(error: unknown): boolean {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return (
			errorMessage.includes("rate limit") ||
			errorMessage.includes("network") ||
			errorMessage.includes("timeout")
		);
	}

	async generate(
		options: GenerateOptions,
		streamHandler?: StreamHandler,
	): Promise<string> {
		const startTime = Date.now();

		try {
			// Validate options
			const validatedOptions = validateGenerateOptions(options);
			const {
				prompt,
				model = "llama2",
				context = [],
				temperature = 0.7,
				topP = 0.9,
				system,
				stream = false,
			} = validatedOptions;

			this.logger.debug("Starting generation", {
				model,
				temperature,
				topP,
				stream,
			});

			let lastError: unknown;

			// Implement retry logic with exponential backoff
			for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
				try {
					if (attempt > 0) {
						this.logger.info("Retrying generation", { attempt, model });
					}

					if (stream && streamHandler) {
						let fullResponse = "";
						let finalMetrics = {
							prompt_eval_count: 0,
							eval_count: 0,
							eval_duration: 0,
							total_duration: 0,
							load_duration: 0,
							done: false,
							context: [] as number[],
						};

						try {
							const stream = await this.ollama.generate({
								model,
								prompt,
								options: {
									temperature,
									top_p: topP,
								},
								system: system || "You are a helpful AI assistant.",
								context,
								stream: true,
							});

							for await (const part of stream) {
								if (streamHandler.onToken) {
									await streamHandler.onToken(part.response);
								}
								fullResponse += part.response;
								// Update metrics with the latest values
								finalMetrics = {
									...finalMetrics,
									...part,
								};
							}

							const duration = Date.now() - startTime;
							const finalResponse = {
								...finalMetrics,
								response: fullResponse,
							};

							this.logger.info("Stream completed", {
								model,
								duration,
								promptTokens: finalResponse.prompt_eval_count,
								totalTokens: finalResponse.eval_count,
							});

							if (streamHandler.onComplete) {
								await streamHandler.onComplete(finalResponse);
							}

							return fullResponse;
						} catch (error) {
							if (streamHandler.onError) {
								await streamHandler.onError(
									error instanceof Error ? error : new Error(String(error)),
								);
							}
							throw error;
						}
					} else {
						const response = await this.ollama.generate({
							model,
							prompt,
							options: {
								temperature,
								top_p: topP,
							},
							system: system || "You are a helpful AI assistant.",
							context,
							stream: false,
						});

						const duration = Date.now() - startTime;
						this.logger.info("Generation successful", {
							model,
							duration,
							promptTokens: response.prompt_eval_count,
							totalTokens: response.eval_count,
						});

						return response.response;
					}
				} catch (error) {
					lastError = error;

					if (!this.isRetryableError(error) || attempt === this.maxRetries) {
						break;
					}

					const delay = this.baseRetryDelay * 2 ** attempt;
					this.logger.warn("Generation failed, will retry", {
						attempt,
						delay,
						error: error instanceof Error ? error.message : String(error),
					});

					await this.sleep(delay);
				}
			}

			// Handle errors after all retries are exhausted
			const errorMessage =
				lastError instanceof Error ? lastError.message : String(lastError);
			let generativeError: GenerativeError;

			if (errorMessage.includes("rate limit")) {
				generativeError = new GenerativeError(
					"Rate limit exceeded",
					GenerativeErrorCode.RATE_LIMIT_EXCEEDED,
					lastError,
					{ prompt, model },
				);
			} else if (errorMessage.includes("model not found")) {
				generativeError = new GenerativeError(
					"Invalid model specified",
					GenerativeErrorCode.INVALID_MODEL,
					lastError,
					{ model },
				);
			} else if (
				errorMessage.includes("network") ||
				errorMessage.includes("timeout")
			) {
				generativeError = new GenerativeError(
					"Network error occurred",
					GenerativeErrorCode.NETWORK_ERROR,
					lastError,
					{ attempt: this.maxRetries + 1 },
				);
			} else if (options.stream) {
				generativeError = new GenerativeError(
					"Streaming error occurred",
					GenerativeErrorCode.STREAM_ERROR,
					lastError,
					{ prompt, model },
				);
			} else {
				generativeError = new GenerativeError(
					"Failed to generate content",
					GenerativeErrorCode.GENERATION_FAILED,
					lastError,
					{ prompt, model },
				);
			}

			const duration = Date.now() - startTime;
			this.logger.error("Generation failed", generativeError, { duration });
			throw generativeError;
		} catch (error) {
			if (error instanceof GenerativeError) {
				throw error;
			}

			const validationError = new GenerativeError(
				"Validation failed",
				GenerativeErrorCode.VALIDATION_FAILED,
				error,
				options,
			);
			this.logger.error("Validation failed", validationError);
			throw validationError;
		}
	}
}
