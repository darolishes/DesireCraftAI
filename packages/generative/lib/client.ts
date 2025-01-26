import { Ollama } from "ollama";
import {
	type GenerateOptions,
	type ModelConfig,
	type ModelConfigOptions,
	type ModelManager,
	type ModelStatus,
	type StreamHandler,
	validateGenerateOptions,
	validateModelConfig,
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

export class GenerativeClient implements ModelManager {
	private ollama: Ollama;
	private maxRetries: number;
	private baseRetryDelay: number;
	private logger: Logger;
	private modelConfigs: Map<string, ModelConfig>;
	private modelStatus: Map<string, ModelStatus>;

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

		this.modelConfigs = new Map();
		this.modelStatus = new Map();

		// Initialize with default Ollama models
		this.modelConfigs.set("llama2", {
			id: "llama2",
			name: "Llama 2",
			provider: "ollama",
			capabilities: {
				maxContextLength: 4096,
				streaming: true,
				systemPrompts: true,
				temperatureRange: {
					min: 0,
					max: 2,
					default: 0.7,
				},
				topPRange: {
					min: 0,
					max: 1,
					default: 0.9,
				},
			},
		});
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

	async listModels(): Promise<ModelConfig[]> {
		try {
			const response = await this.ollama.list();
			const models = response.models.map((model) => {
				const config = this.modelConfigs.get(model.name) || {
					id: model.name,
					name: model.name,
					provider: "ollama",
					capabilities: {
						maxContextLength: 4096,
						streaming: true,
						systemPrompts: true,
						temperatureRange: {
							min: 0,
							max: 2,
							default: 0.7,
						},
						topPRange: {
							min: 0,
							max: 1,
							default: 0.9,
						},
					},
				};
				this.modelConfigs.set(model.name, config);
				return config;
			});

			this.logger.debug("Listed available models", { count: models.length });
			return models;
		} catch (error) {
			throw new GenerativeError(
				"Failed to list models",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error,
			);
		}
	}

	async getModel(modelId: string): Promise<ModelConfig | null> {
		try {
			// Try to get from cache first
			const cachedConfig = this.modelConfigs.get(modelId);
			if (cachedConfig) {
				return cachedConfig;
			}

			// Check if model exists in Ollama
			const response = await this.ollama.show({ model: modelId });
			if (response) {
				const config: ModelConfig = {
					id: modelId,
					name: modelId,
					provider: "ollama",
					capabilities: {
						maxContextLength: 4096,
						streaming: true,
						systemPrompts: true,
						temperatureRange: {
							min: 0,
							max: 2,
							default: 0.7,
						},
						topPRange: {
							min: 0,
							max: 1,
							default: 0.9,
						},
					},
					config: Object.entries(response).reduce(
						(acc, [key, value]) => {
							acc[key] = value;
							return acc;
						},
						{} as Record<string, unknown>,
					),
				};
				this.modelConfigs.set(modelId, config);
				return config;
			}

			return null;
		} catch (error) {
			if (error instanceof Error && error.message.includes("no such model")) {
				return null;
			}
			throw new GenerativeError(
				"Failed to get model information",
				GenerativeErrorCode.INVALID_MODEL,
				error,
			);
		}
	}

	async getModelStatus(modelId: string): Promise<ModelStatus> {
		try {
			const status = this.modelStatus.get(modelId) || {
				loaded: false,
				status: "loading",
			};

			// Update status from Ollama
			try {
				await this.ollama.show({ model: modelId });
				status.loaded = true;
				status.status = "ready";
				status.error = undefined;
			} catch (error) {
				status.loaded = false;
				status.status = "error";
				status.error = error instanceof Error ? error.message : String(error);
			}

			this.modelStatus.set(modelId, status);
			return status;
		} catch (error) {
			throw new GenerativeError(
				"Failed to get model status",
				GenerativeErrorCode.INVALID_MODEL,
				error,
			);
		}
	}

	private async applyModelConfig(
		modelId: string,
		config?: ModelConfigOptions,
	): Promise<void> {
		if (!config) return;

		const validatedConfig = validateModelConfig(config);
		if (!validatedConfig) return;

		const modelParams: Record<string, unknown> = {};

		// Apply model parameters
		if (validatedConfig.parameters) {
			const {
				contextLength,
				gpuLayers,
				quantization,
				threads,
				batchSize,
				modelParams: customParams,
			} = validatedConfig.parameters;
			if (contextLength) modelParams.context_length = contextLength;
			if (gpuLayers) modelParams.gpu_layers = gpuLayers;
			if (quantization) modelParams.quantization = quantization;
			if (threads) modelParams.num_threads = threads;
			if (batchSize) modelParams.batch_size = batchSize;
			if (customParams) Object.assign(modelParams, customParams);
		}

		// Apply resource limits
		if (validatedConfig.resources) {
			const { maxMemory, maxGpuMemory, cpuCores } = validatedConfig.resources;
			if (maxMemory) modelParams.max_memory = maxMemory;
			if (maxGpuMemory) modelParams.max_gpu_memory = maxGpuMemory;
			if (cpuCores) modelParams.num_cpu = cpuCores;
		}

		// Apply performance settings
		if (validatedConfig.performance) {
			const { useGpu, useMetal, useTensorCores } = validatedConfig.performance;
			if (useGpu !== undefined) modelParams.use_gpu = useGpu;
			if (useMetal !== undefined) modelParams.use_metal = useMetal;
			if (useTensorCores !== undefined)
				modelParams.use_tensor_cores = useTensorCores;
		}

		try {
			// Update model configuration in Ollama
			await this.ollama.show({ model: modelId, ...modelParams });

			// Update cached config
			const existingConfig = this.modelConfigs.get(modelId);
			if (existingConfig) {
				const updatedConfig: ModelConfig = {
					...existingConfig,
					customConfig: validatedConfig,
				};
				this.modelConfigs.set(modelId, updatedConfig);
			}

			this.logger.info("Applied model configuration", {
				modelId,
				configParams: modelParams,
			});
		} catch (error) {
			throw new GenerativeError(
				"Failed to apply model configuration",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error,
				{ modelId, configParams: modelParams },
			);
		}
	}

	async updateModelConfig(
		modelId: string,
		config: ModelConfigOptions,
	): Promise<void> {
		try {
			// Validate model exists
			const modelConfig = await this.getModel(modelId);
			if (!modelConfig) {
				throw new GenerativeError(
					`Model '${modelId}' not found`,
					GenerativeErrorCode.INVALID_MODEL,
				);
			}

			// Apply configuration
			await this.applyModelConfig(modelId, config);

			// Update model status
			const status = await this.getModelStatus(modelId);
			if (status.loaded) {
				// Reload model to apply changes
				await this.unloadModel(modelId);
				await this.preloadModel(modelId, config);
			}
		} catch (error) {
			if (error instanceof GenerativeError) throw error;
			throw new GenerativeError(
				"Failed to update model configuration",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error,
				{ modelId, config },
			);
		}
	}

	async preloadModel(
		modelId: string,
		config?: ModelConfigOptions,
	): Promise<void> {
		try {
			const status = await this.getModelStatus(modelId);
			if (status.loaded) {
				this.logger.debug("Model already loaded", { modelId });
				if (config) {
					// Update configuration if provided
					await this.updateModelConfig(modelId, config);
				}
				return;
			}

			this.logger.info("Preloading model", { modelId, config });

			// Apply configuration before loading
			if (config) {
				await this.applyModelConfig(modelId, config);
			}

			await this.ollama.pull({ model: modelId });

			const newStatus: ModelStatus = {
				loaded: true,
				status: "ready",
				lastUsed: new Date(),
			};
			this.modelStatus.set(modelId, newStatus);
		} catch (error) {
			throw new GenerativeError(
				"Failed to preload model",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error,
				{ modelId, config },
			);
		}
	}

	async unloadModel(modelId: string): Promise<void> {
		try {
			const status = await this.getModelStatus(modelId);
			if (!status.loaded) {
				this.logger.debug("Model not loaded", { modelId });
				return;
			}

			this.logger.info("Unloading model", { modelId });
			await this.ollama.delete({ model: modelId });

			const newStatus: ModelStatus = {
				loaded: false,
				status: "ready",
				lastUsed: new Date(),
			};
			this.modelStatus.set(modelId, newStatus);
		} catch (error) {
			throw new GenerativeError(
				"Failed to unload model",
				GenerativeErrorCode.INITIALIZATION_FAILED,
				error,
			);
		}
	}

	async generate(
		options: GenerateOptions,
		streamHandler?: StreamHandler,
	): Promise<string> {
		const startTime = Date.now();

		try {
			const validatedOptions = validateGenerateOptions(options);
			const { model = "llama2" } = validatedOptions;

			// Validate model availability
			const modelConfig = await this.getModel(model);
			if (!modelConfig) {
				throw new GenerativeError(
					`Model '${model}' not found`,
					GenerativeErrorCode.INVALID_MODEL,
				);
			}

			// Update model status
			const status = await this.getModelStatus(model);
			if (status.status === "error") {
				throw new GenerativeError(
					`Model '${model}' is in error state: ${status.error}`,
					GenerativeErrorCode.INVALID_MODEL,
				);
			}

			// Validate options
			const {
				prompt,
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
