/**
 * Zod schemas cho M9.1 Symptom Triage.
 */
import { z } from "zod";

// 5 urgency levels — số int 1..5
export const UrgencyLevelSchema = z.number().int().min(1).max(5);

// User action after seeing triage result
export const UserActionSchema = z.enum(["monitor", "book_clinic", "emergency", "ignored"]);

// Vet review status (admin reviews session sau)
export const VetReviewStatusSchema = z.enum(["pending", "reviewed", "disagree"]);

// POST /triage/start
export const TriageStartSchema = z.object({
  symptoms: z
    .array(z.string().min(1).max(50))
    .min(1, "Chọn ít nhất 1 triệu chứng")
    .max(20, "Tối đa 20 triệu chứng/lần"),
  duration_hours: z.number().nonnegative().max(720), // tối đa 30 ngày
  notes: z.string().trim().max(1000).nullable().optional(),
});

// POST /triage/sessions/:id/feedback — user action
export const TriageFeedbackSchema = z.object({
  user_action_taken: UserActionSchema,
});

// AI response (Gemini structured output)
export const TriageAIResponseSchema = z.object({
  urgency_level: UrgencyLevelSchema,
  reasoning_vi: z.string().min(10).max(2000),
  recommended_action_vi: z.string().min(10).max(1000),
});

export type TriageStart = z.infer<typeof TriageStartSchema>;
export type TriageFeedback = z.infer<typeof TriageFeedbackSchema>;
export type TriageAIResponse = z.infer<typeof TriageAIResponseSchema>;
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;
