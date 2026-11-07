import { z } from "zod";
import { isValidPrizeSplit, MAX_PRIZE_PLACES } from "./prize.js";

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x address")
  .transform((s) => s as `0x${string}`);

export const allowedAssetSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema,
  symbol: z.string().min(1).max(16),
});

export const MIN_LEAD_MS = 5 * 60 * 1000;
export const MIN_DURATION_MS = 10 * 60 * 1000;
export const DEMO_MIN_DURATION_MS = 2 * 60 * 1000;

export interface CreateTrenchOptions {
  now?: Date;
  demoMode?: boolean;
}

/** Form-level schema with the error copy from COPY.md. */
export function createTrenchSchema(opts: CreateTrenchOptions = {}) {
  const now = opts.now ?? new Date();
  const minDuration = opts.demoMode ? DEMO_MIN_DURATION_MS : MIN_DURATION_MS;
  return z
    .object({
      name: z.string().trim().min(3, "Name needs at least 3 characters.").max(60, "Name is too long."),
      description: z.string().trim().max(500).default(""),
      startAt: z.string().datetime({ offset: true }),
      endAt: z.string().datetime({ offset: true }),
      allowedAssets: z.array(allowedAssetSchema).min(1, "Add at least one asset."),
      prizePoolUsdc: z.number().positive("Prize pool must be more than 0.").max(1_000_000),
      prizeSplit: z
        .array(z.number().int().min(0))
        .min(1)
        .max(MAX_PRIZE_PLACES)
        .refine(isValidPrizeSplit, (s) => ({
          message: `Prize split adds up to ${s.reduce((a, b) => a + b, 0)}%, needs 100%.`,
        })),
      entryRule: z.enum(["open", "invite"]).default("open"),
      adminFeeShareBps: z.number().int().min(0).max(10_000).default(5000),
    })
    .superRefine((v, ctx) => {
      const start = Date.parse(v.startAt);
      const end = Date.parse(v.endAt);
      if (end <= start) {
        ctx.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
      } else if (end - start < minDuration) {
        ctx.addIssue({
          code: "custom",
          path: ["endAt"],
          message: `A season must run for at least ${minDuration / 60000} minutes.`,
        });
      }
      if (!opts.demoMode && start < now.getTime() + MIN_LEAD_MS) {
        ctx.addIssue({ code: "custom", path: ["startAt"], message: "Start at least 5 minutes from now." });
      }
    });
}

export type CreateTrenchInput = z.input<ReturnType<typeof createTrenchSchema>>;
export type CreateTrenchParsed = z.output<ReturnType<typeof createTrenchSchema>>;
