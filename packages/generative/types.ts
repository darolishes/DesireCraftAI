import { z } from "zod";

/**
 * Configuration options for text generation
 */
export const generateOptionsSchema = z.object({
	prompt: z
		.string()
		.min(1, "Prompt cannot be empty")
		.max(1000, "Prompt exceeds maximum length of 1000 characters")
		.describe("The input prompt for generation"),

	model: z
		.string()
		.min(1, "Model ID cannot be empty")
		.default("llama2")
		.describe("The ID of the model to use for generation"),

	context: z
		.array(z.number())
		.optional()
		.default([])
		.describe("Previous conversation context tokens"),

	temperature: z
		.number()
		.min(0, "Temperature must be at least 0")
		.max(2, "Temperature cannot exceed 2")
		.optional()
		.default(0.7)
		.describe(
			"Controls randomness in the output (0 = deterministic, 2 = maximum randomness)",
		),

	topP: z
		.number()
		.min(0, "Top P must be at least 0")
		.max(1, "Top P cannot exceed 1")
		.optional()
		.default(0.9)
		.describe("Controls diversity via nucleus sampling"),

	system: z
		.string()
		.optional()
		.describe("System prompt to control the model's behavior"),

	stream: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether to stream the response token by token"),
});

export type GenerateOptions = z.infer<typeof generateOptionsSchema>;

/**
 * Response from the generation API
 */
export interface GenerateResponse {
	/** The generated text response */
	response: string;

	/** Token IDs from the conversation history */
	context: number[];

	/** Whether the generation is complete */
	done: boolean;

	/** Total time taken for the request in milliseconds */
	total_duration: number;

	/** Time taken to load the model in milliseconds */
	load_duration: number;

	/** Number of tokens in the prompt */
	prompt_eval_count: number;

	/** Total number of tokens evaluated */
	eval_count: number;

	/** Time spent on token generation in milliseconds */
	eval_duration: number;
}

/**
 * Streaming response handler
 */
export interface StreamHandler {
	/** Called when a new token is generated */
	onToken?(token: string): void | Promise<void>;

	/** Called when the generation is complete */
	onComplete?(response: GenerateResponse): void | Promise<void>;

	/** Called when an error occurs during streaming */
	onError?(error: Error): void | Promise<void>;
}

/**
 * Validation helper for generate options
 */
export const validateGenerateOptions = (options: unknown): GenerateOptions => {
	return generateOptionsSchema.parse(options);
};

/**
 * Custom model configuration options
 */
export const modelConfigSchema = z
	.object({
		/** Model-specific parameters */
		parameters: z
			.object({
				/** Context window size */
				contextLength: z.number().min(512).max(32768).optional(),
				/** Number of layers to offload to GPU */
				gpuLayers: z.number().min(0).optional(),
				/** Model quantization level (if supported) */
				quantization: z.enum(["none", "4bit", "5bit", "8bit"]).optional(),
				/** Number of threads to use for computation */
				threads: z.number().min(1).optional(),
				/** Batch size for processing */
				batchSize: z.number().min(1).optional(),
				/** Model-specific parameters */
				modelParams: z.record(z.unknown()).optional(),
			})
			.optional(),

		/** Resource limits */
		resources: z
			.object({
				/** Maximum memory usage in bytes */
				maxMemory: z.number().min(0).optional(),
				/** Maximum GPU memory usage in bytes */
				maxGpuMemory: z.number().min(0).optional(),
				/** CPU cores to use */
				cpuCores: z.number().min(1).optional(),
			})
			.optional(),

		/** Performance tuning */
		performance: z
			.object({
				/** Enable/disable GPU acceleration */
				useGpu: z.boolean().optional(),
				/** Enable/disable metal acceleration (Apple Silicon) */
				useMetal: z.boolean().optional(),
				/** Enable/disable tensor cores (NVIDIA) */
				useTensorCores: z.boolean().optional(),
			})
			.optional(),
	})
	.optional();

export type ModelConfigOptions = z.infer<typeof modelConfigSchema>;

/**
 * Model configuration and capabilities
 */
export interface ModelConfig {
	/** Unique identifier for the model */
	id: string;

	/** Display name for the model */
	name: string;

	/** Model provider (e.g., 'ollama', 'openai') */
	provider: string;

	/** Model capabilities and limits */
	capabilities: {
		/** Maximum context length in tokens */
		maxContextLength: number;

		/** Whether the model supports streaming */
		streaming: boolean;

		/** Whether the model supports system prompts */
		systemPrompts: boolean;

		/** Supported temperature range */
		temperatureRange: {
			min: number;
			max: number;
			default: number;
		};

		/** Supported top_p range */
		topPRange: {
			min: number;
			max: number;
			default: number;
		};
	};

	/** Custom configuration options */
	customConfig?: ModelConfigOptions;

	/** Model-specific metadata */
	metadata?: Record<string, unknown>;

	/** Raw model configuration */
	config?: Record<string, unknown>;
}

/**
 * Model status information
 */
export interface ModelStatus {
	/** Whether the model is currently loaded */
	loaded: boolean;

	/** Current status of the model */
	status: "ready" | "loading" | "error";

	/** Memory usage in bytes */
	memoryUsage?: number;

	/** Last error if status is 'error' */
	error?: string;

	/** Timestamp of last usage */
	lastUsed?: Date;
}

/**
 * Model management operations
 */
export interface ModelManager {
	/** List all available models */
	listModels(): Promise<ModelConfig[]>;

	/** Get detailed information about a specific model */
	getModel(modelId: string): Promise<ModelConfig | null>;

	/** Get current status of a model */
	getModelStatus(modelId: string): Promise<ModelStatus>;

	/** Preload a model into memory */
	preloadModel(modelId: string, config?: ModelConfigOptions): Promise<void>;

	/** Update model configuration */
	updateModelConfig(modelId: string, config: ModelConfigOptions): Promise<void>;

	/** Unload a model from memory */
	unloadModel(modelId: string): Promise<void>;
}

/**
 * Validation helper for model configuration
 */
export const validateModelConfig = (config: unknown): ModelConfigOptions => {
	return modelConfigSchema.parse(config);
};

/**
 * Configuration template for model settings
 */
export const configTemplateSchema = z.object({
	/** Template identifier */
	id: z.string().min(1),

	/** Display name */
	name: z.string().min(1),

	/** Template description */
	description: z.string().optional(),

	/** Hardware requirements */
	hardware: z
		.object({
			minMemory: z.number().optional(),
			minGpuMemory: z.number().optional(),
			gpuRequired: z.boolean().optional(),
			metalSupport: z.boolean().optional(),
		})
		.optional(),

	/** Model configuration */
	config: modelConfigSchema,

	/** Compatible model patterns */
	modelPatterns: z.array(z.string()).min(1),

	/** Tags for categorization */
	tags: z.array(z.string()).optional(),
});

export type ConfigTemplate = z.infer<typeof configTemplateSchema>;

/**
 * Prompt template for structured generation
 */
export const promptTemplateSchema = z.object({
	/** Template identifier */
	id: z.string().min(1),

	/** Display name */
	name: z.string().min(1),

	/** Template description */
	description: z.string().optional(),

	/** The prompt template with variables */
	template: z.string().min(1),

	/** Variable definitions */
	variables: z.array(
		z.object({
			name: z.string().min(1),
			description: z.string().optional(),
			required: z.boolean().default(true),
			defaultValue: z.string().optional(),
			validation: z
				.object({
					minLength: z.number().optional(),
					maxLength: z.number().optional(),
					pattern: z.string().optional(),
				})
				.optional(),
		}),
	),

	/** System prompt template */
	systemTemplate: z.string().optional(),

	/** Recommended model settings */
	modelSettings: z
		.object({
			models: z.array(z.string()),
			temperature: z.number().optional(),
			topP: z.number().optional(),
			configTemplate: z.string().optional(),
		})
		.optional(),

	/** Example usage */
	examples: z
		.array(
			z.object({
				description: z.string().optional(),
				variables: z.record(z.string()),
				output: z.string(),
			}),
		)
		.optional(),

	/** Tags for categorization */
	tags: z.array(z.string()).optional(),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

/**
 * Template management operations
 */
export interface TemplateManager {
	/** List available configuration templates */
	listConfigTemplates(): Promise<ConfigTemplate[]>;

	/** Get configuration template by ID */
	getConfigTemplate(id: string): Promise<ConfigTemplate | null>;

	/** Apply configuration template to model */
	applyConfigTemplate(modelId: string, templateId: string): Promise<void>;

	/** List available prompt templates */
	listPromptTemplates(): Promise<PromptTemplate[]>;

	/** Get prompt template by ID */
	getPromptTemplate(id: string): Promise<PromptTemplate | null>;

	/** Generate text using prompt template */
	generateFromTemplate(
		templateId: string,
		variables: Record<string, string>,
		options?: Partial<GenerateOptions>,
	): Promise<string>;
}
