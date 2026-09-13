import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import * as Haptics from 'expo-haptics';

import { PDF_BASE_URL } from '@/constants/config';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/lib/apiClient';
import {
  downloadPdfFile,
  findDownloadedPdfById,
  getFullPdfUrl,
  isPdfFileDownloaded,
} from '@/lib/pdfStorage';

type PdfDocument = {
  _id: string;
  title: string;
  pdfUrl: string;
  thumbnail?: string;
  createdAt: string;
  viewCount: number;
  category: string;
};

const formatAccessedAt = (value: Date) => {
  const pad = (input: number) => String(input).padStart(2, '0');
  const day = pad(value.getDate());
  const month = pad(value.getMonth() + 1);
  const year = String(value.getFullYear());
  const hours = pad(value.getHours());
  const minutes = pad(value.getMinutes());

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const buildWatermarkItems = (width: number, height: number) => {
  const rows = 4;
  const verticalStep = height / rows;
  const items: { key: string; left: number; top: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    const columns = row % 2 === 0 ? 1 : 2;

    for (let column = 0; column < columns; column += 1) {
      const centerX = width * ((column + 1) / (columns + 1));
      items.push({
        key: `${row}-${column}`,
        left: centerX - 130,
        top: row * verticalStep + verticalStep * 0.16,
      });
    }
  }

  return items;
};

export default function PdfDetails() {
  const { id, filePath, title, thumbnailPath } = useLocalSearchParams<{
    id: string;
    filePath?: string;
    title?: string;
    thumbnailPath?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, initializing } = useAuth();
  const { width, height } = useWindowDimensions();

  // In edge-to-edge mode, status bar is transparent and overlaps screen content.
  // Calculate a safe top padding so the heading and buttons sit cleanly below the notification bar (time, battery, etc.)
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;
  const topPadding = Math.max(insets.top, statusBarHeight) + 12;

  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessedAt, setAccessedAt] = useState(() => formatAccessedAt(new Date()));

  useEffect(() => {
    if (id) {
      setAccessedAt(formatAccessedAt(new Date()));
    }
  }, [id]);

  // Load PDF metadata (handles both offline files and API metadata)
  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    (async () => {
      try {
        setLoading(true);

        // 1. If explicit filePath was passed from offline screen
        if (filePath && isMounted) {
          setLocalFilePath(filePath);
          const fname = filePath.split('/').pop() || `${title || id}.pdf`;
          setLocalFileName(fname);
          setDoc({
            _id: id,
            title: title || fname.replace(/_[^_]+\.pdf$/, '').replace(/_/g, ' '),
            pdfUrl: filePath,
            createdAt: new Date().toISOString(),
            viewCount: 0,
            category: 'Offline',
          });
          setLoading(false);
          return;
        }

        // 2. Check if file already exists locally in downloads/vayureader
        const localMatch = await findDownloadedPdfById(id);
        if (localMatch && isMounted) {
          setLocalFilePath(localMatch.path);
          setLocalFileName(localMatch.fileName);
        }

        // 3. If user is not logged in (no token), open the local file directly without calling API
        if (!token) {
          if (localMatch && isMounted) {
            const fname = localMatch.fileName;
            setDoc({
              _id: id,
              title: title || fname.replace(/_[^_]+\.pdf$/, '').replace(/_/g, ' '),
              pdfUrl: localMatch.path,
              createdAt: new Date().toISOString(),
              viewCount: 0,
              category: 'Offline',
            });
            setError(null);
          } else if (isMounted) {
            setError('This document is not downloaded locally. Please login to view online documents.');
          }
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        // 4. If logged in, fetch metadata from backend
        const response = await apiClient.get<any>(`/api/pdfs/${id}`, {
          baseURL: PDF_BASE_URL,
        });
        const data = response.data?.data;
        if (isMounted && data) {
          setDoc(data);
          setError(null);
          // Check by title if not found by ID earlier
          if (!localMatch && data.title) {
            const byTitle = await isPdfFileDownloaded(data.title, data._id);
            if (byTitle) {
              const fullMatch = await findDownloadedPdfById(data._id);
              if (fullMatch && isMounted) {
                setLocalFilePath(fullMatch.path);
                setLocalFileName(fullMatch.fileName);
              }
            }
          }
        }
      } catch (apiErr: any) {
        if (isMounted) {
          // If network failed but local file is present, still display the document
          if (localFilePath) {
            setError(null);
          } else {
            setError(apiErr.message || 'Failed to load PDF details.');
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [id, filePath, title, token]);

  // Handle Download action
  const performDownload = useCallback(async () => {
    if (!doc) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsDownloading(true);
      setDownloadProgress(0);

      const result = await downloadPdfFile(
        {
          _id: doc._id,
          title: doc.title,
          pdfUrl: doc.pdfUrl,
          thumbnail: doc.thumbnail,
          category: doc.category,
        },
        (progress) => setDownloadProgress(progress)
      );

      setLocalFilePath(result.path);
      setLocalFileName(result.fileName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Download Complete',
        `File saved to downloads/vayureader/${result.fileName}`
      );
    } catch (err: any) {
      Alert.alert('Download Failed', err?.message || 'Could not download PDF.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }, [doc]);

  const handleDownloadPress = useCallback(() => {
    if (!doc) return;

    if (localFilePath && localFileName) {
      Alert.alert(
        'PDF Downloaded',
        `This file is saved at:\ndownloads/vayureader/${localFileName}`,
        [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Re-download',
            onPress: performDownload,
          },
        ]
      );
      return;
    }

    performDownload();
  }, [doc, localFilePath, localFileName, performDownload]);

  if (loading || initializing) {
    const previewUri =
      thumbnailPath ||
      (doc?.thumbnail ? getFullPdfUrl(PDF_BASE_URL, doc.thumbnail) : null);
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Top Header */}
        <View style={[styles.customHeader, { paddingTop: topPadding }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.headerBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title || 'Loading Document...'}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.centerDark}>
          {previewUri ? (
            <Image
              source={{
                uri:
                  previewUri.startsWith('file://') || previewUri.startsWith('http')
                    ? previewUri
                    : `file://${previewUri}`,
                ...(token && previewUri.startsWith('http')
                  ? { headers: { Authorization: `Bearer ${token}` } }
                  : {}),
              }}
              style={styles.loadingCover}
              resizeMode="cover"
            />
          ) : null}
          <ActivityIndicator size="large" color="#5B5FEF" />
          <Text style={styles.loadingText}>Loading PDF...</Text>
        </View>
      </View>
    );
  }

  if (error || !doc) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Top Header */}
        <View style={[styles.customHeader, { paddingTop: topPadding }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.headerBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title || 'PDF Document'}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.centerDark}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to Load PDF</Text>
            <Text style={styles.errorDesc}>{error || 'PDF not found'}</Text>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Determine PDF source: local file if available in downloads/vayureader, else remote URL
  let pdfSource: any;
  if (localFilePath) {
    const fileUri =
      localFilePath.startsWith('file://') || localFilePath.startsWith('content://')
        ? localFilePath
        : `file://${localFilePath}`;
    pdfSource = { uri: fileUri };
  } else {
    const pdfUrl = doc.pdfUrl ? getFullPdfUrl(PDF_BASE_URL, doc.pdfUrl) : '';
    pdfSource = {
      uri: pdfUrl,
      cache: true,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    };
  }

  const watermarkLabel = `${user?.phone_number ?? 'Unknown user'} ${accessedAt}`;
  const watermarkItems = buildWatermarkItems(width, height);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Top Header sitting comfortably below status bar */}
      <View style={[styles.customHeader, { paddingTop: topPadding }]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.headerBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {doc.title}
          </Text>
          {doc.category ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {doc.category}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleDownloadPress}
          disabled={isDownloading}
          style={styles.headerActionBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {isDownloading ? (
            <View style={styles.downloadingRow}>
              <ActivityIndicator size="small" color="#5B5FEF" />
              <Text style={styles.headerProgressText}>{downloadProgress}%</Text>
            </View>
          ) : localFilePath ? (
            <View style={styles.downloadedIconBadge}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
            </View>
          ) : (
            <View style={styles.downloadIconBtn}>
              <Ionicons name="download-outline" size={22} color="#ffffff" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* PDF View Container */}
      <View style={styles.pdfWrapper}>
        <Pdf
          source={pdfSource}
          style={[styles.pdf, { width }]}
          trustAllCerts={false}
          onError={(pdfError) => {
            console.error('[PDF Viewer] Error loading PDF:', pdfError);
            Alert.alert('PDF Error', 'Failed to render PDF document.');
          }}
        />

        {/* Security Watermark */}
        <View pointerEvents="none" style={styles.watermarkLayer}>
          {watermarkItems.map(item => (
            <Text
              key={item.key}
              style={[
                styles.watermarkText,
                {
                  left: item.left,
                  top: item.top,
                },
              ]}
            >
              {watermarkLabel}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0D23',
  },
  customHeader: {
    backgroundColor: '#0f0D23',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1B38',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1B3A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2B52',
  },
  headerActionBtn: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1B3A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#2D2B52',
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  pdfWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  pdf: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerDark: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0a0915',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  loadingCover: {
    width: 140,
    height: 190,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#1E1A38',
    borderWidth: 1,
    borderColor: '#37325E',
  },
  errorCard: {
    backgroundColor: '#1C1B3A',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#2A2955',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#5B5FEF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  downloadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerProgressText: {
    color: '#5B5FEF',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadedIconBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadIconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  watermarkText: {
    position: 'absolute',
    width: 260,
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
    opacity: 0.15,
    transform: [{ rotate: '-24deg' }],
  },
});
