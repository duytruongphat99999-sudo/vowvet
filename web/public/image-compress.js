/**
 * Client-side image compression utility.
 * Browser global function `compressImage(file)`.
 *
 * Rules:
 *   - File size ≤ 1 MB: return original (no compress)
 *   - Resize: max width = 1600px (giữ ratio)
 *   - Quality: JPEG 0.8
 *   - Output type: image/jpeg (chuyển PNG/WebP về JPEG để giảm size)
 *
 * Returns: Promise<File | null> — null nếu compress fail (caller dùng nguyên file).
 */
window.compressImage = async function compressImage(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  if (file.size <= 1_000_000) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 1600;
      let { width, height } = img;
      if (width > MAX_W) {
        height = Math.round((MAX_W / width) * height);
        width = MAX_W;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};
