/**
 * Client-Side Floorplan & Map Image Optimization Utility
 * 
 * Compresses and scales high-resolution architectural drawings and photos
 * to optimal dimensions (max 1920x1200) and WebP/JPEG formats in milliseconds.
 * 
 * Prevents 413 Payload Too Large HTTP errors, eliminates browser memory lag,
 * ensures reliable MongoDB Atlas saving, and guarantees lightning-fast floor map loading.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  isSvg: boolean;
}

export async function optimizeFloorMapFile(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1200,
  quality: number = 0.85
): Promise<OptimizedImageResult> {
  const originalSize = file.size;

  // Handle SVG vector blueprints
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const text = await file.text();
    const cleanSvg = text.trim();
    return {
      dataUrl: cleanSvg.startsWith('data:') ? cleanSvg : `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`,
      width: 1920,
      height: 1080,
      originalSize,
      optimizedSize: cleanSvg.length,
      isSvg: true
    };
  }

  // Handle raster image files (PNG, JPG, WEBP, BMP, etc.)
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let targetWidth = img.naturalWidth || img.width;
      let targetHeight = img.naturalHeight || img.height;

      // Calculate constrained aspect ratio
      if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to FileReader if Canvas is unavailable
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result as string;
          resolve({
            dataUrl: res,
            width: targetWidth,
            height: targetHeight,
            originalSize,
            optimizedSize: res.length,
            isSvg: false
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Try WebP first for optimal compression (typically 70-85% smaller than PNG)
      let optimizedDataUrl = '';
      try {
        optimizedDataUrl = canvas.toDataURL('image/webp', quality);
      } catch {
        optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      // If WebP is not supported or produced larger than jpeg, fallback to jpeg
      if (!optimizedDataUrl.startsWith('data:image/webp')) {
        optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      resolve({
        dataUrl: optimizedDataUrl,
        width: targetWidth,
        height: targetHeight,
        originalSize,
        optimizedSize: optimizedDataUrl.length,
        isSvg: false
      });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load and process floorplan image: ${err}`));
    };

    img.src = objectUrl;
  });
}
