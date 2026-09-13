import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { PDF_BASE_URL } from '@/constants/config';
import { getToken } from './authStorage';

const FS = ReactNativeBlobUtil.fs;

export interface LocalPdfItem {
  fileName: string;
  filePath: string;
  title: string;
  id: string;
  size?: number;
  lastModified?: number;
  thumbnailPath?: string;
  category?: string;
}

export interface DownloadPdfParams {
  _id: string;
  title: string;
  pdfUrl: string;
  thumbnail?: string;
  category?: string;
}

const REGISTRY_FILE = `${FS.dirs.DocumentDir}/vayureader_registry.json`;

/**
 * Returns the target storage directory: downloads/vayureader
 * On Android, points to the device's public Download folder: /storage/emulated/0/Download/vayureader.
 * On iOS, falls back to DocumentDir/vayureader.
 */
export const getVayuDownloadDir = (): string => {
  if (Platform.OS === 'android') {
    const baseDir = FS.dirs.LegacyDownloadDir || '/storage/emulated/0/Download';
    return `${baseDir}/vayureader`;
  }
  return `${FS.dirs.DocumentDir}/vayureader`;
};

/**
 * Generates safe file name in name_id.pdf format
 */
export const getSafePdfFileName = (title: string, id: string): string => {
  const cleanTitle = (title || 'document')
    .trim()
    .replace(/[^\w\s-]/g, '') // strip special characters
    .replace(/\s+/g, '_');    // replace spaces with underscores
  const cleanId = String(id || '').replace(/[^\w-]/g, '_');
  return `${cleanTitle}_${cleanId}.pdf`;
};

/**
 * Returns the expected local path for a PDF in downloads/vayureader
 */
export const getLocalPdfPath = (title: string, id: string): string => {
  return `${getVayuDownloadDir()}/${getSafePdfFileName(title, id)}`;
};

/**
 * Read the persistent downloads registry
 */
export const getDownloadsRegistry = async (): Promise<LocalPdfItem[]> => {
  try {
    if (await FS.exists(REGISTRY_FILE)) {
      const content = await FS.readFile(REGISTRY_FILE, 'utf8');
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[PDF Storage] Failed to read registry:', err);
  }
  return [];
};

/**
 * Save the downloads registry
 */
export const saveDownloadsRegistry = async (items: LocalPdfItem[]): Promise<void> => {
  try {
    await FS.writeFile(REGISTRY_FILE, JSON.stringify(items), 'utf8');
  } catch (err) {
    console.warn('[PDF Storage] Failed to write registry:', err);
  }
};

/**
 * Normalizes full URL from path
 */
export const getFullPdfUrl = (base: string, path: any): string => {
  if (!path) return '';
  if (typeof path !== 'string') return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  cleanPath = cleanPath.replace(/\\/g, '/');
  return `${cleanBase}${cleanPath}`;
};

/**
 * Finds local thumbnail path for a document id or filename
 */
export const findLocalThumbnail = async (id: string, nameWithoutExt?: string): Promise<string | null> => {
  try {
    const cleanId = String(id || '').replace(/[^\w-]/g, '_');
    const thumbDir = `${FS.dirs.DocumentDir}/thumbnails`;
    const publicDir = getVayuDownloadDir();

    const candidates: string[] = [
      `${thumbDir}/${cleanId}.jpg`,
      `${thumbDir}/${cleanId}.png`,
      `${thumbDir}/${cleanId}.jpeg`,
      `${thumbDir}/${cleanId}_thumb.jpg`,
      `${thumbDir}/${cleanId}_thumb.png`,
    ];

    if (nameWithoutExt) {
      candidates.push(
        `${thumbDir}/${nameWithoutExt}_thumb.jpg`,
        `${thumbDir}/${nameWithoutExt}_thumb.png`,
        `${thumbDir}/${nameWithoutExt}.jpg`,
        `${publicDir}/${nameWithoutExt}_thumb.jpg`,
        `${publicDir}/${nameWithoutExt}_thumb.png`,
        `${publicDir}/${nameWithoutExt}.jpg`,
        `${publicDir}/${nameWithoutExt}.png`
      );
    }

    for (const c of candidates) {
      if (await FS.exists(c)) {
        return c;
      }
    }
  } catch {}
  return null;
};

/**
 * Cleans up old internal/update folders and migrates files to the public downloads/vayureader folder
 */
export const cleanupOldUpdateFolders = async (): Promise<void> => {
  try {
    const publicDir = getVayuDownloadDir();
    const oldInternalDir = `${FS.dirs.DocumentDir}/vayureader`;

    if (await FS.exists(oldInternalDir)) {
      const files = await FS.ls(oldInternalDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png')) {
          const oldFilePath = `${oldInternalDir}/${file}`;
          const newFilePath = `${publicDir}/${file}`;
          try {
            if (!(await FS.exists(newFilePath))) {
              try {
                if (!(await FS.exists(publicDir))) {
                  await FS.mkdir(publicDir);
                }
                await FS.cp(oldFilePath, newFilePath);
                if (Platform.OS === 'android') {
                  const mime = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
                  await FS.scanFile([{ path: newFilePath, mime }]);
                }
              } catch {}
            }
          } catch {}
          try { await FS.unlink(oldFilePath); } catch {}
        }
      }
      try { await FS.unlink(oldInternalDir); } catch {}
    }

    // Also check app-private external download dir if it's different from the public one
    const oldAppExtDir = `${FS.dirs.DownloadDir}/vayureader`;
    if (oldAppExtDir !== publicDir && (await FS.exists(oldAppExtDir))) {
      const files = await FS.ls(oldAppExtDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png')) {
          const oldFilePath = `${oldAppExtDir}/${file}`;
          const newFilePath = `${publicDir}/${file}`;
          try {
            if (!(await FS.exists(newFilePath))) {
              try {
                if (!(await FS.exists(publicDir))) {
                  await FS.mkdir(publicDir);
                }
                await FS.cp(oldFilePath, newFilePath);
                if (Platform.OS === 'android') {
                  const mime = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
                  await FS.scanFile([{ path: newFilePath, mime }]);
                }
              } catch {}
            }
          } catch {}
          try { await FS.unlink(oldFilePath); } catch {}
        }
      }
      try { await FS.unlink(oldAppExtDir); } catch {}
    }
  } catch (err) {
    console.log('[PDF Storage] Non-fatal cleanup notice:', err);
  }
};

/**
 * Downloads a PDF (and its cover thumbnail image) and stores them in downloads/vayureader
 */
export const downloadPdfFile = async (
  pdf: DownloadPdfParams,
  onProgress?: (percent: number) => void
): Promise<{ path: string; fileName: string; thumbnailPath?: string }> => {
  const fileName = getSafePdfFileName(pdf.title, pdf._id);
  const cleanId = String(pdf._id || '').replace(/[^\w-]/g, '_');
  const cleanTitle = (pdf.title || 'document').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  const publicDir = getVayuDownloadDir();
  const targetPath = `${publicDir}/${fileName}`;

  // Download into app cache first for atomic reliability
  const tempPath = `${FS.dirs.CacheDir}/temp_${Date.now()}_${fileName}`;

  const token = await getToken();
  const fullUrl = getFullPdfUrl(PDF_BASE_URL, pdf.pdfUrl);

  if (!fullUrl) {
    throw new Error('Invalid PDF URL');
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const downloadTask = ReactNativeBlobUtil.config({
    path: tempPath,
    overwrite: true,
  }).fetch('GET', fullUrl, headers);

  if (onProgress) {
    downloadTask.progress((received, total) => {
      const numTotal = Number(total);
      const numReceived = Number(received);
      const percent = numTotal > 0 ? Math.round((numReceived / numTotal) * 100) : 0;
      onProgress(percent);
    });
  }

  const res = await downloadTask;
  const status = res.info().status;

  if (status < 200 || status >= 300) {
    if (await FS.exists(tempPath)) {
      await FS.unlink(tempPath);
    }
    throw new Error(`Download failed with status ${status}`);
  }

  // Get file size from temp file
  let fileSize = 0;
  try {
    const s = await FS.stat(tempPath);
    fileSize = Number(s.size);
  } catch {}

  let finalPath = targetPath;
  let savedToPublic = false;

  // 1. Try direct copy to public downloads/vayureader
  try {
    if (!(await FS.exists(publicDir))) {
      await FS.mkdir(publicDir);
    }
    if (await FS.exists(targetPath)) {
      try { await FS.unlink(targetPath); } catch {}
    }
    await FS.cp(tempPath, targetPath);
    if (await FS.exists(targetPath)) {
      savedToPublic = true;
      finalPath = targetPath;
      if (Platform.OS === 'android') {
        try {
          await FS.scanFile([{ path: targetPath, mime: 'application/pdf' }]);
        } catch {}
      }
    }
  } catch (cpErr) {
    console.log('[PDF Storage] Direct copy to public downloads failed, trying MediaStore:', cpErr);
  }

  // 2. If direct copy failed on Android (Scoped Storage), use MediaCollection
  if (!savedToPublic && Platform.OS === 'android') {
    try {
      const mediaUri = await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        {
          name: fileName,
          parentFolder: 'vayureader',
          mimeType: 'application/pdf',
          path: fileName,
        } as any,
        'Download',
        tempPath
      );
      if (mediaUri) {
        savedToPublic = true;
        finalPath = (await FS.exists(targetPath)) ? targetPath : mediaUri;
      }
    } catch (mediaErr) {
      console.warn('[PDF Storage] copyToMediaStore failed:', mediaErr);
    }
  }

  // 3. Fallback to app directory if neither public method succeeded
  if (!savedToPublic) {
    const fallbackDir = `${FS.dirs.DocumentDir}/vayureader`;
    if (!(await FS.exists(fallbackDir))) {
      await FS.mkdir(fallbackDir);
    }
    finalPath = `${fallbackDir}/${fileName}`;
    await FS.cp(tempPath, finalPath);
  }

  // Clean up temporary cache file
  try {
    if (await FS.exists(tempPath)) {
      await FS.unlink(tempPath);
    }
  } catch {}

  // 4. Download and store cover thumbnail image for rich offline view mechanics
  let localThumbPath: string | undefined;
  if (pdf.thumbnail) {
    try {
      const thumbDir = `${FS.dirs.DocumentDir}/thumbnails`;
      if (!(await FS.exists(thumbDir))) {
        await FS.mkdir(thumbDir);
      }
      const isPng = pdf.thumbnail.toLowerCase().includes('.png');
      const thumbExt = isPng ? 'png' : 'jpg';
      const thumbFileName = `${cleanTitle}_${cleanId}_thumb.${thumbExt}`;
      const thumbDest = `${thumbDir}/${cleanId}.${thumbExt}`;

      const thumbUrl = getFullPdfUrl(PDF_BASE_URL, pdf.thumbnail);
      if (thumbUrl) {
        const thumbTask = ReactNativeBlobUtil.config({
          path: thumbDest,
          overwrite: true,
        }).fetch('GET', thumbUrl, headers);

        const thumbRes = await thumbTask;
        if (thumbRes.info().status >= 200 && thumbRes.info().status < 300) {
          localThumbPath = thumbDest;

          // Also place a copy in downloads/vayureader so user has the cover image in Downloads
          try {
            const publicThumbPath = `${publicDir}/${thumbFileName}`;
            if (await FS.exists(publicDir)) {
              if (await FS.exists(publicThumbPath)) {
                try { await FS.unlink(publicThumbPath); } catch {}
              }
              await FS.cp(thumbDest, publicThumbPath);
              if (Platform.OS === 'android') {
                await FS.scanFile([{ path: publicThumbPath, mime: `image/${thumbExt}` }]);
              }
            }
          } catch {}
        }
      }
    } catch (tErr) {
      console.log('[PDF Storage] Thumbnail download non-fatal error:', tErr);
    }
  }

  // Save to persistent registry
  try {
    const registry = await getDownloadsRegistry();
    const updated = registry.filter(item => item.id !== pdf._id && item.fileName !== fileName);
    updated.unshift({
      id: pdf._id,
      title: pdf.title,
      fileName,
      filePath: finalPath,
      size: fileSize,
      lastModified: Date.now(),
      thumbnailPath: localThumbPath,
      category: pdf.category,
    });
    await saveDownloadsRegistry(updated);
  } catch (regErr) {
    console.warn('[PDF Storage] Failed to update registry:', regErr);
  }

  return { path: finalPath, fileName, thumbnailPath: localThumbPath };
};

/**
 * Checks if a specific PDF file exists locally in downloads/vayureader
 */
export const isPdfFileDownloaded = async (title: string, id: string): Promise<boolean> => {
  try {
    const directPath = getLocalPdfPath(title, id);
    if (await FS.exists(directPath)) {
      return true;
    }
    const match = await findDownloadedPdfById(id);
    return match !== null;
  } catch {
    return false;
  }
};

/**
 * Finds a downloaded PDF by ID if present in downloads/vayureader
 */
export const findDownloadedPdfById = async (id: string): Promise<{ path: string; fileName: string; thumbnailPath?: string } | null> => {
  try {
    const cleanId = String(id || '').replace(/[^\w-]/g, '_');

    // 1. Check registry first
    const registry = await getDownloadsRegistry();
    const regItem = registry.find(
      r => r.id === id || r.fileName.endsWith(`_${cleanId}.pdf`)
    );
    if (regItem) {
      if (regItem.filePath.startsWith('content://') || (await FS.exists(regItem.filePath))) {
        let thumb = regItem.thumbnailPath;
        if (!thumb || !(await FS.exists(thumb))) {
          thumb = (await findLocalThumbnail(id, regItem.fileName.replace(/\.pdf$/i, ''))) || undefined;
        }
        return { path: regItem.filePath, fileName: regItem.fileName, thumbnailPath: thumb };
      }
    }

    // 2. Check public directory
    const dir = getVayuDownloadDir();
    if (await FS.exists(dir)) {
      const files = await FS.ls(dir);
      const match = files.find(f => f.endsWith(`_${cleanId}.pdf`));
      if (match) {
        const fullPath = `${dir}/${match}`;
        if (await FS.exists(fullPath)) {
          const thumb = await findLocalThumbnail(id, match.replace(/\.pdf$/i, ''));
          return { path: fullPath, fileName: match, thumbnailPath: thumb || undefined };
        }
      }
    }

    // 3. Check internal directory (in case not yet migrated)
    const intDir = `${FS.dirs.DocumentDir}/vayureader`;
    if (await FS.exists(intDir)) {
      const files = await FS.ls(intDir);
      const match = files.find(f => f.endsWith(`_${cleanId}.pdf`));
      if (match) {
        const fullPath = `${intDir}/${match}`;
        if (await FS.exists(fullPath)) {
          const thumb = await findLocalThumbnail(id, match.replace(/\.pdf$/i, ''));
          return { path: fullPath, fileName: match, thumbnailPath: thumb || undefined };
        }
      }
    }
  } catch (err) {
    console.warn('[PDF Storage] Error searching for downloaded PDF:', err);
  }
  return null;
};

/**
 * Lists all PDF files stored in downloads/vayureader with their cover images
 */
export const getDownloadedPdfList = async (): Promise<LocalPdfItem[]> => {
  try {
    // Run cleanup of old internal/update directories
    await cleanupOldUpdateFolders();

    const dir = getVayuDownloadDir();
    const itemsMap = new Map<string, LocalPdfItem>();

    // 1. Read files from the public downloads/vayureader directory
    if (await FS.exists(dir)) {
      try {
        const files = await FS.ls(dir);
        const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

        for (const fileName of pdfFiles) {
          const filePath = `${dir}/${fileName}`;
          const nameWithoutExt = fileName.replace(/\.pdf$/i, '');
          const lastUnderscore = nameWithoutExt.lastIndexOf('_');
          let title = nameWithoutExt;
          let id = nameWithoutExt;
          if (lastUnderscore > 0) {
            title = nameWithoutExt.substring(0, lastUnderscore).replace(/_/g, ' ');
            id = nameWithoutExt.substring(lastUnderscore + 1);
          }

          let size: number | undefined;
          let lastModified: number | undefined;
          try {
            const stat = await FS.stat(filePath);
            size = Number(stat.size);
            lastModified = Number(stat.lastModified);
          } catch {}

          const thumbPath = await findLocalThumbnail(id, nameWithoutExt);

          itemsMap.set(fileName, {
            fileName,
            filePath,
            title,
            id,
            size,
            lastModified: lastModified || Date.now(),
            thumbnailPath: thumbPath || undefined,
          });
        }
      } catch (lsErr) {
        console.log('[PDF Storage] Directory listing note:', lsErr);
      }
    }

    // 2. Merge with registry (verifying that each file still exists)
    const registry = await getDownloadsRegistry();
    const verifiedRegistry: LocalPdfItem[] = [];

    for (const regItem of registry) {
      const exists =
        regItem.filePath.startsWith('content://') || (await FS.exists(regItem.filePath));
      if (exists) {
        let thumb = regItem.thumbnailPath;
        if (!thumb || !(await FS.exists(thumb))) {
          thumb = (await findLocalThumbnail(regItem.id, regItem.fileName.replace(/\.pdf$/i, ''))) || undefined;
        }

        verifiedRegistry.push({ ...regItem, thumbnailPath: thumb });
        const existing = itemsMap.get(regItem.fileName);
        itemsMap.set(regItem.fileName, {
          ...regItem,
          title: regItem.title || existing?.title || regItem.fileName,
          size: regItem.size || existing?.size,
          lastModified: regItem.lastModified || existing?.lastModified,
          thumbnailPath: thumb || existing?.thumbnailPath,
          category: regItem.category || existing?.category,
        });
      }
    }

    // Keep registry synchronized
    if (verifiedRegistry.length !== registry.length) {
      await saveDownloadsRegistry(verifiedRegistry);
    }

    const result = Array.from(itemsMap.values());
    return result.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  } catch (err) {
    console.warn('[PDF Storage] Failed to list downloaded PDFs:', err);
    return [];
  }
};

/**
 * Deletes a downloaded PDF file (and its local cover thumbnail image) from downloads/vayureader
 */
export const deleteDownloadedFile = async (filePath: string): Promise<boolean> => {
  try {
    let deleted = false;
    if (await FS.exists(filePath)) {
      await FS.unlink(filePath);
      deleted = true;
    }

    // Remove associated thumbnail file
    try {
      const fileName = filePath.split('/').pop() || '';
      const nameWithoutExt = fileName.replace(/\.pdf$/i, '');
      const lastUnderscore = nameWithoutExt.lastIndexOf('_');
      const id = lastUnderscore > 0 ? nameWithoutExt.substring(lastUnderscore + 1) : '';
      const thumb = await findLocalThumbnail(id, nameWithoutExt);
      if (thumb && (await FS.exists(thumb))) {
        await FS.unlink(thumb);
      }
    } catch {}

    // Remove from registry
    try {
      const registry = await getDownloadsRegistry();
      const updated = registry.filter(item => item.filePath !== filePath);
      await saveDownloadsRegistry(updated);
      deleted = true;
    } catch {}

    return deleted;
  } catch (err) {
    console.warn('[PDF Storage] Failed to delete file:', err);
    return false;
  }
};
