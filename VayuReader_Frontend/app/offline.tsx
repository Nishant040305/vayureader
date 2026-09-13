import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { images } from '@/constants/images';
import {
  deleteDownloadedFile,
  getDownloadedPdfList,
  LocalPdfItem,
} from '@/lib/pdfStorage';

type ViewMode = 'grid' | 'list';

export default function OfflineScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<LocalPdfItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const items = await getDownloadedPdfList();
      setFiles(items);
    } catch (err) {
      console.warn('Failed to load local PDF files:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFiles();
  };

  const handleOpenFile = (item: LocalPdfItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/pdfread/[id]',
      params: {
        id: item.id,
        filePath: item.filePath,
        title: item.title,
        ...(item.thumbnailPath ? { thumbnailPath: item.thumbnailPath } : {}),
      },
    });
  };

  const handleDeleteFile = (item: LocalPdfItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Downloaded PDF',
      `Are you sure you want to remove "${item.title}" from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteDownloadedFile(item.filePath);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadFiles();
            } else {
              Alert.alert('Error', 'Failed to delete the file.');
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'PDF';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    const kb = bytes / 1024;
    return `${Math.round(kb)} KB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    files.forEach(f => {
      if (f.category) set.add(f.category);
    });
    return ['All', ...Array.from(set)];
  }, [files]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const query = searchText.trim().toLowerCase();
      const matchesSearch =
        !query ||
        f.title.toLowerCase().includes(query) ||
        f.fileName.toLowerCase().includes(query);
      const matchesCategory =
        selectedCategory === 'All' || f.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [files, searchText, selectedCategory]);

  const toggleViewMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(prev => (prev === 'grid' ? 'list' : 'grid'));
  };

  // Render Thumbnail Helper
  const renderCoverImage = (item: LocalPdfItem, isGrid: boolean) => {
    const hasThumb = Boolean(item.thumbnailPath);
    const imageUri = item.thumbnailPath
      ? item.thumbnailPath.startsWith('file://')
        ? item.thumbnailPath
        : `file://${item.thumbnailPath}`
      : null;

    if (hasThumb && imageUri) {
      return (
        <Image
          source={{ uri: imageUri }}
          style={isGrid ? styles.gridCoverImage : styles.listCoverImage}
          resizeMode="cover"
        />
      );
    }

    return (
      <View style={isGrid ? styles.gridPlaceholder : styles.listPlaceholder}>
        <View style={styles.placeholderIconCircle}>
          <Ionicons name="document-text" size={isGrid ? 28 : 22} color="#EF4444" />
        </View>
        {isGrid && (
          <Text style={styles.placeholderText} numberOfLines={2}>
            {item.title}
          </Text>
        )}
      </View>
    );
  };

  // Grid Card
  const renderGridItem = ({ item }: { item: LocalPdfItem }) => (
    <TouchableOpacity
      style={styles.gridCard}
      onPress={() => handleOpenFile(item)}
      activeOpacity={0.78}
    >
      <View style={styles.gridCoverWrapper}>
        {renderCoverImage(item, true)}

        {/* Category Floating Badge */}
        {item.category ? (
          <View style={styles.gridCategoryBadge}>
            <Text style={styles.gridCategoryText} numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        ) : null}

        {/* File Size Floating Badge */}
        <View style={styles.gridSizeBadge}>
          <Text style={styles.gridSizeText}>{formatFileSize(item.size)}</Text>
        </View>
      </View>

      <View style={styles.gridDetails}>
        <Text style={styles.gridTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.gridBottomRow}>
          <Text style={styles.gridDateText}>{formatDate(item.lastModified)}</Text>
          <TouchableOpacity
            style={styles.gridDeleteBtn}
            onPress={() => handleDeleteFile(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // List Card
  const renderListItem = ({ item }: { item: LocalPdfItem }) => (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => handleOpenFile(item)}
      activeOpacity={0.75}
    >
      <View style={styles.listCoverWrapper}>
        {renderCoverImage(item, false)}
      </View>

      <View style={styles.listTextContainer}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.listFileName} numberOfLines={1}>
          {item.fileName}
        </Text>

        <View style={styles.listMetaRow}>
          {item.category ? (
            <View style={styles.listCategoryBadge}>
              <Text style={styles.listCategoryText}>{item.category}</Text>
            </View>
          ) : null}
          <Text style={styles.listMetaText}>{formatFileSize(item.size)}</Text>
          {item.lastModified ? (
            <>
              <Text style={styles.listMetaDot}>•</Text>
              <Text style={styles.listMetaText}>{formatDate(item.lastModified)}</Text>
            </>
          ) : null}
        </View>
      </View>

      <TouchableOpacity
        style={styles.listDeleteButton}
        onPress={() => handleDeleteFile(item)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={images.bg} style={styles.container} resizeMode="cover">
      <View style={styles.overlay}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Offline Library</Text>
            <Text style={styles.headerSubtitle}>
              {files.length} {files.length === 1 ? 'file' : 'files'} in downloads/vayureader
            </Text>
          </View>

          {/* Grid / List View Toggle */}
          <TouchableOpacity
            onPress={toggleViewMode}
            style={styles.headerBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list' : 'grid'}
              size={20}
              color="#5B5FEF"
            />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#7C86AA" style={{ marginRight: 8 }} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search downloaded files..."
            placeholderTextColor="#7C86AA"
            style={styles.searchInput}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color="#7C86AA" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter Chips */}
        {categories.length > 2 && (
          <View style={styles.categoryBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {categories.map(cat => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(cat);
                    }}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Main Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#5B5FEF" />
            <Text style={styles.loadingText}>Loading offline library...</Text>
          </View>
        ) : filteredFiles.length > 0 ? (
          <FlatList
            key={viewMode} // Re-render FlatList when switching columns
            data={filteredFiles}
            keyExtractor={item => item.filePath}
            numColumns={viewMode === 'grid' ? 2 : 1}
            renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
            contentContainerStyle={
              viewMode === 'grid' ? styles.gridContent : styles.listContent
            }
            columnWrapperStyle={viewMode === 'grid' ? styles.columnWrapper : undefined}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="library-outline" size={44} color="#5B5FEF" />
            </View>
            <Text style={styles.emptyTitle}>
              {searchText || selectedCategory !== 'All'
                ? 'No Matching PDFs'
                : 'No Offline PDFs'}
            </Text>
            <Text style={styles.emptyMessage}>
              {searchText || selectedCategory !== 'All'
                ? 'Try a different filter or search term.'
                : 'PDFs and their cover images you download will appear here with rich cover previews, readable anytime without internet or login.'}
            </Text>
            {!searchText && selectedCategory === 'All' && (
              <TouchableOpacity
                style={styles.loginBtn}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Text style={styles.loginBtnText}>Go Back</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
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
  headerTitles: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1731',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2540',
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  categoryBar: {
    marginBottom: 12,
  },
  categoryScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1C1B3A',
    borderWidth: 1,
    borderColor: '#2D2B52',
  },
  categoryChipSelected: {
    backgroundColor: '#5B5FEF',
    borderColor: '#5B5FEF',
  },
  categoryChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextSelected: {
    color: '#ffffff',
  },
  gridContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  gridCard: {
    flex: 0.48,
    backgroundColor: '#151329',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#262247',
  },
  gridCoverWrapper: {
    width: '100%',
    height: 190,
    backgroundColor: '#1D1938',
    position: 'relative',
    overflow: 'hidden',
  },
  gridCoverImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1B1736',
  },
  placeholderIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#271F42',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  placeholderText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.8,
  },
  gridCategoryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(91, 95, 239, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gridCategoryText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  gridSizeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gridSizeText: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '600',
  },
  gridDetails: {
    padding: 10,
  },
  gridTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 6,
  },
  gridBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridDateText: {
    color: '#7C86AA',
    fontSize: 10,
  },
  gridDeleteBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151329',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262247',
  },
  listCoverWrapper: {
    width: 60,
    height: 85,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1D1938',
    marginRight: 12,
  },
  listCoverImage: {
    width: '100%',
    height: '100%',
  },
  listPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1B1736',
  },
  listTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  listTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  listFileName: {
    color: '#7C86AA',
    fontSize: 11,
    marginBottom: 6,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listCategoryBadge: {
    backgroundColor: '#261F42',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#3D3466',
  },
  listCategoryText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '600',
  },
  listMetaText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  listMetaDot: {
    color: '#6B7280',
    fontSize: 11,
    marginHorizontal: 6,
  },
  listDeleteButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E1B3A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2E2C54',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  loginBtn: {
    backgroundColor: '#5B5FEF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  loginBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
