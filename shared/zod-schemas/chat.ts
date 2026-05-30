/**
 * Zod schemas cho M9.2 Telehealth Chat.
 */
import { z } from "zod";

export const ThreadCreateSchema = z.object({
  pet_id: z.number().int().positive().nullable().optional(),
  subject: z.string().trim().min(1, "Tiêu đề không được trống").max(200),
  initial_message: z.string().trim().min(1, "Tin nhắn đầu tiên không được trống").max(5000),
});

export const MessageSendSchema = z.object({
  content: z.string().trim().min(1, "Tin nhắn không được trống").max(5000),
  attachment_url: z
    .string()
    .url({ message: "URL đính kèm không hợp lệ" })
    .nullable()
    .optional(),
});

export const ThreadCloseSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const EscalateTriageSchema = z.object({
  subject_override: z.string().trim().min(1).max(200).optional(),
});

export type ThreadCreateInput = z.infer<typeof ThreadCreateSchema>;
export type MessageSendInput = z.infer<typeof MessageSendSchema>;
export type ThreadCloseInput = z.infer<typeof ThreadCloseSchema>;
export type EscalateTriageInput = z.infer<typeof EscalateTriageSchema>;
