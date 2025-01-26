import { z } from "zod";

export const generateOptionsSchema = z.object({
	prompt: z.string().min(1).max(1000),
	model: z.string().optional().default("llama2"),
	context: z.record(z.unknown()).optional(),
	temperature: z.number().min(0).max(2).optional().default(0.7),
	topP: z.number().min(0).max(1).optional().default(0.9),
	system: z.string().optional(),
});

export type GenerateOptions = z.infer<typeof generateOptionsSchema>;

export interface GenerateResponse {
	response: string;
	context: number[];
	done: boolean;
	total_duration: number;
	load_duration: number;
	prompt_eval_count: number;
	eval_count: number;
	eval_duration: number;
}
