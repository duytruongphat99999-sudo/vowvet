/**
 * Zod schemas for M13 Personality Quiz.
 */
import { z } from "zod";

// Answers map: { q1: "a", q2: "b", ... q20: "d" }
export const PersonalitySubmitSchema = z.object({
  answers: z.record(z.string().regex(/^q\d{1,2}$/), z.enum(["a", "b", "c", "d"])),
});

export type PersonalitySubmitInput = z.infer<typeof PersonalitySubmitSchema>;
