import { z } from "zod";
import { db } from "../../../database";
import { logger } from "../../../logs";
import { protectedProcedure } from "../../../trpc/base";

export const aiBaseProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	return next({
		ctx: {
			...ctx,
			db,
			logger: logger.child({ module: "generative" }),
		},
	});
});

export const generateContentSchema = z.object({
	prompt: z.string().min(1).max(1000),
	model: z.string().optional().default("llama2"),
	context: z.record(z.unknown()).optional(),
});
