import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	GenerativeClient,
	GenerativeError,
	GenerativeErrorCode,
	type Logger,
} from "./client";

// Mock logger for testing
class TestLogger implements Logger {
	logs: Array<{
		level: string;
		message: string;
		error?: Error;
		context?: Record<string, unknown>;
	}> = [];

	debug(message: string, context?: Record<string, unknown>) {
		this.logs.push({ level: "debug", message, context });
	}
	info(message: string, context?: Record<string, unknown>) {
		this.logs.push({ level: "info", message, context });
	}
	warn(message: string, context?: Record<string, unknown>) {
		this.logs.push({ level: "warn", message, context });
	}
	error(message: string, error?: Error, context?: Record<string, unknown>) {
		this.logs.push({ level: "error", message, error, context });
	}

	logPerformance(
		operation: string,
		durationMs: number,
		context?: Record<string, unknown>,
	) {
		this.logs.push({
			level: "performance",
			message: operation,
			context: { durationMs, ...context },
		});
	}

	logResourceUsage(
		resource: string,
		usage: number,
		context?: Record<string, unknown>,
	) {
		this.logs.push({
			level: "resource",
			message: resource,
			context: { usage, ...context },
		});
	}

	logModelEvent(
		event: "load" | "unload" | "configure",
		modelId: string,
		context?: Record<string, unknown>,
	) {
		this.logs.push({
			level: "model",
			message: event,
			context: { modelId, ...context },
		});
	}

	logTemplateUsage(
		templateId: string,
		type: "config" | "prompt",
		context?: Record<string, unknown>,
	) {
		this.logs.push({
			level: "template",
			message: templateId,
			context: { type, ...context },
		});
	}

	logGenerationMetrics(
		modelId: string,
		metrics: {
			promptTokens: number;
			totalTokens: number;
			durationMs: number;
			tokensPerSecond: number;
		},
		context?: Record<string, unknown>,
	) {
		this.logs.push({
			level: "metrics",
			message: modelId,
			context: { metrics, ...context },
		});
	}

	clear() {
		this.logs = [];
	}
}

const mockGenerate = vi.fn();

vi.mock("ollama", () => ({
	Ollama: vi.fn().mockImplementation(() => ({
		generate: mockGenerate,
	})),
}));

describe("GenerativeClient", () => {
	let client: GenerativeClient;
	let logger: TestLogger;

	beforeEach(() => {
		vi.clearAllMocks();
		logger = new TestLogger();
		client = new GenerativeClient({ logger });
	});

	describe("initialization", () => {
		it("should initialize with default options", () => {
			const client = new GenerativeClient();
			expect(client).toBeInstanceOf(GenerativeClient);
		});

		it("should initialize with custom options", () => {
			const client = new GenerativeClient({
				host: "http://custom-host:11434",
				maxRetries: 5,
				baseRetryDelay: 2000,
			});
			expect(client).toBeInstanceOf(GenerativeClient);
		});

		it("should log initialization", () => {
			expect(logger.logs[0]).toEqual({
				level: "info",
				message: "GenerativeClient initialized",
				context: { host: "http://localhost:11434" },
			});
		});
	});

	describe("generate", () => {
		const mockResponse = {
			response: "Generated text",
			prompt_eval_count: 10,
			eval_count: 20,
			context: [] as number[],
			done: true,
			total_duration: 100,
			load_duration: 50,
			eval_duration: 50,
		};

		const defaultGenerateOptions = {
			prompt: "Test prompt",
			model: "llama2",
			context: [] as number[],
			temperature: 0.7,
			topP: 0.9,
			stream: false,
		};

		it("should generate text successfully", async () => {
			mockGenerate.mockResolvedValueOnce(mockResponse);

			const result = await client.generate(defaultGenerateOptions);

			expect(result).toBe("Generated text");
			expect(logger.logs).toContainEqual({
				level: "debug",
				message: "Starting generation",
				context: expect.objectContaining({
					model: "llama2",
					stream: false,
				}),
			});
			expect(logger.logs).toContainEqual({
				level: "info",
				message: "Generation successful",
				context: expect.objectContaining({
					promptTokens: 10,
					totalTokens: 20,
				}),
			});
		});

		it("should retry on retryable errors", async () => {
			const error = new Error("rate limit exceeded");
			mockGenerate
				.mockRejectedValueOnce(error)
				.mockResolvedValueOnce(mockResponse);

			const result = await client.generate(defaultGenerateOptions);

			expect(result).toBe("Generated text");
			expect(logger.logs).toContainEqual({
				level: "warn",
				message: "Generation failed, will retry",
				context: expect.objectContaining({
					attempt: 0,
					error: "rate limit exceeded",
				}),
			});
		});

		it("should throw on validation error", async () => {
			await expect(
				client.generate({
					...defaultGenerateOptions,
					prompt: "",
				}),
			).rejects.toThrow(GenerativeError);

			expect(logger.logs).toContainEqual({
				level: "error",
				message: "Validation failed",
				error: expect.any(GenerativeError),
			});
		});

		it("should throw on non-retryable error", async () => {
			const error = new Error("model not found");
			mockGenerate.mockRejectedValueOnce(error);

			await expect(
				client.generate({
					...defaultGenerateOptions,
					model: "invalid-model",
				}),
			).rejects.toThrow(
				expect.objectContaining({
					message: "Invalid model specified",
					code: GenerativeErrorCode.INVALID_MODEL,
				}),
			);
		});

		describe("streaming", () => {
			const mockStreamResponse = {
				response: " token",
				prompt_eval_count: 1,
				eval_count: 2,
				context: [] as number[],
				done: true,
				total_duration: 10,
				load_duration: 5,
				eval_duration: 5,
			};

			it("should handle streaming responses", async () => {
				const streamHandler = {
					onToken: vi.fn(),
					onComplete: vi.fn(),
					onError: vi.fn(),
				};

				const mockStream = {
					[Symbol.asyncIterator]: async function* () {
						yield mockStreamResponse;
						yield { ...mockStreamResponse, response: " by" };
						yield { ...mockStreamResponse, response: " token" };
					},
				};

				mockGenerate.mockResolvedValueOnce(mockStream);

				const result = await client.generate(
					{ ...defaultGenerateOptions, stream: true },
					streamHandler,
				);

				expect(result).toBe(" token by token");
				expect(streamHandler.onToken).toHaveBeenCalledTimes(3);
				expect(streamHandler.onComplete).toHaveBeenCalledTimes(1);
				expect(streamHandler.onError).not.toHaveBeenCalled();
			});

			it("should handle streaming errors", async () => {
				const streamHandler = {
					onToken: vi.fn(),
					onComplete: vi.fn(),
					onError: vi.fn(),
				};

				const streamError = new Error("Stream error");
				mockGenerate.mockRejectedValueOnce(streamError);

				await expect(
					client.generate(
						{ ...defaultGenerateOptions, stream: true },
						streamHandler,
					),
				).rejects.toThrow(
					expect.objectContaining({
						message: "Streaming error occurred",
						code: GenerativeErrorCode.STREAM_ERROR,
					}),
				);

				expect(streamHandler.onError).toHaveBeenCalledWith(streamError);
				expect(streamHandler.onComplete).not.toHaveBeenCalled();
			});

			it("should handle partial streaming before error", async () => {
				const streamHandler = {
					onToken: vi.fn(),
					onComplete: vi.fn(),
					onError: vi.fn(),
				};

				const streamError = new Error("Stream interrupted");
				const mockStream = {
					[Symbol.asyncIterator]: async function* () {
						yield mockStreamResponse;
						yield { ...mockStreamResponse, response: " by" };
						throw streamError;
					},
				};

				mockGenerate.mockResolvedValueOnce(mockStream);

				await expect(
					client.generate(
						{ ...defaultGenerateOptions, stream: true },
						streamHandler,
					),
				).rejects.toThrow(
					expect.objectContaining({
						message: "Streaming error occurred",
						code: GenerativeErrorCode.STREAM_ERROR,
					}),
				);

				expect(streamHandler.onToken).toHaveBeenCalledTimes(2);
				expect(streamHandler.onError).toHaveBeenCalledWith(streamError);
				expect(streamHandler.onComplete).not.toHaveBeenCalled();
			});
		});
	});
});
