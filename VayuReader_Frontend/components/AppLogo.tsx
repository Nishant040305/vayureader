import React from 'react';
import { Alert, Image, ImageStyle, StyleProp, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { icons } from '@/constants/icons';
import { useAuth } from '@/contexts/AuthContext';

export type AppLogoVariant = 'home' | 'tab' | 'otp-screen';

export const APP_LOGO_STYLES: Record<AppLogoVariant, ImageStyle> = {
  home: {
    alignSelf: 'center',
    width: 96,
    height: 112,
    marginTop: 56,
    marginBottom: 20,
  },
  tab: {
    alignSelf: 'center',
    width: 96,
    height: 112,
    marginTop: 56,
    marginBottom: 20,
  },
  "otp-screen": {
    alignSelf: 'center',
    width: 72,
    height: 88,
    marginTop: 0,
    marginBottom: 0,
  },
};

type AppLogoProps = {
  variant?: AppLogoVariant;
  style?: StyleProp<ImageStyle>;
  showLogout?: boolean;
  showOffline?: boolean;
};

export default function AppLogo({ variant = 'tab', style, showLogout, showOffline }: AppLogoProps) {
  const { signOut } = useAuth();
  const router = useRouter();

  // Show action buttons by default on main tab screens (not on OTP screen)
  const isTabScreen = variant !== 'otp-screen';
  const shouldShowLogout = showLogout !== undefined ? showLogout : isTabScreen;
  const shouldShowOffline = showOffline !== undefined ? showOffline : isTabScreen;

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await signOut();
              router.replace('/auth/login');
            } catch (error) {
              console.warn('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const handleOpenOffline = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/offline');
  };

  if (!shouldShowLogout && !shouldShowOffline) {
    return (
      <Image
        source={icons.logo}
        resizeMode="contain"
        style={[APP_LOGO_STYLES[variant], style]}
      />
    );
  }

  return (
    <View style={styles.container}>
      {shouldShowOffline && (
        <TouchableOpacity
          onPress={handleOpenOffline}
          style={styles.offlineButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="folder-open-outline" size={18} color="#5B5FEF" />
        </TouchableOpacity>
      )}

      <Image
        source={icons.logo}
        resizeMode="contain"
        style={[APP_LOGO_STYLES[variant], style]}
      />

      {shouldShowLogout && (
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
  },
  offlineButton: {
    position: 'absolute',
    left: 20,
    top: 60,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1B3A',
    borderWidth: 1,
    borderColor: '#2E2C54',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoutButton: {
    position: 'absolute',
    right: 20,
    top: 60,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1B3A',
    borderWidth: 1,
    borderColor: '#2E2C54',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
