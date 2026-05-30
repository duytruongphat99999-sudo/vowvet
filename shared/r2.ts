/**
 * Cloudflare R2 client (S3-compatible).
 * Dùng cho upload ảnh thú cưng, ảnh check-in, ảnh health event.
 */
import { S3Client, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined,
  credentials:
    R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
      ? { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
      : undefined,
});

export const r2BucketName = R2_BUCKET_NAME || "";

/** Probe đơn giản: HEAD bucket để xác nhận credential + bucket tồn tại. */
export async function pingR2(): Promise<boolean> {
  if (!R2_BUCKET_NAME) {
    console.error("[r2] thiếu R2_BUCKET_NAME");
    return false;
  }
  try {
    await r2Client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
    return true;
  } catch (err) {
    console.error("[r2] ping failed:", err);
    return false;
  }
}

/**
 * Upload bytes vào R2 với Content-Type.
 * Trả về public URL (R2_PUBLIC_URL + "/" + key).
 */
export async function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<string> {
  if (!R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME chưa cấu hình");
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      // CacheControl 1 năm cho assets pet photo (URL có timestamp nên thay đổi mỗi upload)
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return buildPublicUrl(key);
}

/** Xoá object theo key. Không throw nếu key không tồn tại (R2 bỏ qua). */
export async function deleteObject(key: string): Promise<void> {
  if (!R2_BUCKET_NAME) return;
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
}

/** Build public URL từ key. Bucket phải có Public Access ON trong Cloudflare R2 dashboard. */
export function buildPublicUrl(key: string): string {
  if (!R2_PUBLIC_URL) {
    console.warn("[r2] R2_PUBLIC_URL trống — link công khai sẽ không hoạt động");
    return key;
  }
  return `${R2_PUBLIC_URL}/${key.replace(/^\//, "")}`;
}

/**
 * Suy ra extension từ MIME type (chỉ ảnh, dùng cho pet photo).
 * Trả null nếu MIME không được hỗ trợ.
 */
export function imageExtFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mime.toLowerCase()] || null;
}

/**
 * Suy ra extension từ MIME type audio (dùng cho voice diary upload).
 * Trả null nếu MIME không được hỗ trợ.
 */
export function audioExtFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mp4a-latm": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  // Strip codec suffix (audio/webm;codecs=opus → audio/webm)
  const base = mime.toLowerCase().split(";")[0].trim();
  return map[base] || null;
}
