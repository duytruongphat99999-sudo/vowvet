/**
 * Zod schemas for M12 Public Pet Card.
 */
import { z } from "zod";

export const PublicEnableSchema = z.object({
  public_bio: z.string().trim().max(500).nullable().optional(),
  public_quote: z.string().trim().max(200).nullable().optional(),
  // FOSTER L1: bật chế độ khoe bệnh án công khai (foster card). Default false ở DB.
  foster_public: z.boolean().optional(),
});

export const PublicUpdateSchema = z.object({
  public_bio: z.string().trim().max(500).nullable().optional(),
  public_quote: z.string().trim().max(200).nullable().optional(),
});

export type PublicEnableInput = z.infer<typeof PublicEnableSchema>;
export type PublicUpdateInput = z.infer<typeof PublicUpdateSchema>;
