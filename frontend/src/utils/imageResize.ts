// 上傳前先把照片縮小再轉 base64：
// 手機原圖一張 3～8 MB，10 張 base64 後會超過 nginx 50 MB 的上限，也讓看圖模型跑得慢；
// 縮到長邊 1600px 後一張約 200～400 KB，看圖品質足夠。

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

// 純函式：把 w×h 等比例縮到長邊不超過 maxEdge（不放大）
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// File → 縮圖後的 JPEG data URL。解不開（例如瀏覽器不支援的格式）就退回原檔，功能不中斷。
export async function fileToResizedDataUrl(
  file: File,
  { maxEdge = MAX_EDGE, quality = JPEG_QUALITY }: { maxEdge?: number; quality?: number } = {},
): Promise<string> {
  try {
    // imageOrientation: 依 EXIF 把手機直拍的照片轉正，否則縮圖後會躺著
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      bitmap.close();
    }
  } catch {
    return fileToDataUrl(file);
  }
}

// 同一張照片在生成、插畫、問答會重複用到，縮一次就好
const cache = new WeakMap<File, Promise<string>>();

export function cachedResizedDataUrl(file: File): Promise<string> {
  let p = cache.get(file);
  if (!p) {
    p = fileToResizedDataUrl(file);
    cache.set(file, p);
  }
  return p;
}
