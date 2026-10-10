import { NativeModules, Platform } from 'react-native';

const { PdfThumbnail } = NativeModules;

// In-memory cache holding Base64 data URIs during app runtime.
// Nothing is ever saved or stored on persistent disk/storage.
const thumbnailMemoryCache = new Map<string, string>();

/**
 * Returns a previously generated in-memory thumbnail for the given PDF path, if available.
 */
export const getCachedPdfThumbnail = (pdfPath: string): string | null => {
  if (!pdfPath) return null;
  const cleanPath = pdfPath.startsWith('file://') ? pdfPath.slice(7) : pdfPath;
  return thumbnailMemoryCache.get(cleanPath) || null;
};

/**
 * Clears the in-memory thumbnail for a specific PDF path (e.g. after deletion).
 */
export const clearCachedPdfThumbnail = (pdfPath: string): void => {
  if (!pdfPath) return;
  const cleanPath = pdfPath.startsWith('file://') ? pdfPath.slice(7) : pdfPath;
  thumbnailMemoryCache.delete(cleanPath);
};

/**
 * Generates an in-memory image thumbnail directly from a local PDF file.
 * The thumbnail is NEVER saved or stored to device storage; it returns a base64 Data URI.
 *
 * @param pdfPath Local file path or content:// URI of the PDF.
 * @param pageIndex 0-indexed page number to render (defaults to 0, which is the cover page).
 * @returns The base64 data URI (data:image/jpeg;base64,...) or null if generation failed.
 */
export const generatePdfThumbnail = async (
  pdfPath: string,
  pageIndex: number = 0
): Promise<string | null> => {
  if (!pdfPath) return null;

  const cleanPath = pdfPath.startsWith('file://') ? pdfPath.slice(7) : pdfPath;
  const cached = thumbnailMemoryCache.get(cleanPath);
  if (cached) {
    return cached;
  }

  if (Platform.OS === 'android') {
    if (!PdfThumbnail || typeof PdfThumbnail.generateThumbnail !== 'function') {
      console.warn('[PdfThumbnail] Native module PdfThumbnail is not available');
      return null;
    }

    try {
      // By passing null as outputPath, PdfThumbnailModule renders into memory
      // and returns a base64 data URI without creating any file on disk.
      const thumbUri: string = await PdfThumbnail.generateThumbnail(
        cleanPath,
        null,
        pageIndex
      );

      if (thumbUri) {
        thumbnailMemoryCache.set(cleanPath, thumbUri);
        return thumbUri;
      }
    } catch (err) {
      console.warn('[PdfThumbnail] Failed to generate thumbnail from PDF:', err);
      return null;
    }
  }

  return null;
};
