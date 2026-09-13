import axios from 'axios';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { clearToken, getToken } from './authStorage';
import { getDeviceId } from './deviceId';
import {
  getSessionKey,
  encrypt,
  decrypt,
  clearKeyCache,
} from './encryption';

let cachedDeviceId: string | null = null;

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

// =============================================================================
// PATHS EXCLUDED FROM E2EE (login — no JWT available yet)
// =============================================================================

const E2EE_EXCLUDED = [
  '/api/auth/login/',
  '/api/auth/request-otp',
  '/api/auth/verify-otp',
  '/api/admin/login/',
  '/api/recovery/',
  '/api/admin/recovery/',
];

const isExcluded = (url: string | undefined): boolean => {
  if (!url) return true;
  return E2EE_EXCLUDED.some((p) => url.includes(p));
};

// =============================================================================
// SECURITY ALERT — potential interception / tamper detection
// =============================================================================

let _securityAlertShown = false;

const showSecurityAlert = () => {
  if (_securityAlertShown) return;
  _securityAlertShown = true;
  Alert.alert(
    '⚠️ SECURITY ALERT',
    'Secure communication with the server has been compromised.\n\n' +
    'Someone may be intercepting or tampering with your data.\n\n' +
    'Actions to take:\n' +
    '1. Stop all sensitive operations immediately\n' +
    '2. Disconnect from the current network\n' +
    '3. Report this incident to your IT Security authority\n\n' +
    'Do NOT continue using this application on this network.',
    [{ text: 'Understood', style: 'destructive' }],
    { cancelable: false }
  );
  console.error('[E2EE SECURITY] Possible MITM attack — response decryption failed');
  setTimeout(() => { _securityAlertShown = false; }, 60000);
};

// =============================================================================
// AXIOS INSTANCE
// =============================================================================

const apiClient = axios.create({
  timeout: 60000, // 1-minute timeout to allow heavy requests to complete
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

// =============================================================================
// REQUEST INTERCEPTOR — Auth header + E2EE encryption as text/plain
// =============================================================================

apiClient.interceptors.request.use(async (config) => {
  const url = config.url || '';
  const isAuthFlow = url.includes('/api/auth/login/');

  // Attach Bearer token for non-login requests
  let token: string | null = null;
  if (!isAuthFlow) {
    token = await getToken();
    if (token) {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }

  // Attach Device ID header
  if (!cachedDeviceId) {
    try {
      cachedDeviceId = await getDeviceId();
    } catch {}
  }
  if (cachedDeviceId) {
    (config.headers as any)['x-device-id'] = cachedDeviceId;
  }

  // --- E2EE: Encrypt request body → text/plain ---
  if (!isExcluded(url) && token) {
    const ct = config.headers?.['Content-Type'] || '';
    const isMultipart = typeof ct === 'string' && ct.includes('multipart/form-data');

    if (!isMultipart && config.data && !(config.data instanceof FormData)) {
      try {
        const key = getSessionKey(token);
        if (key) {
          config.data = await encrypt(config.data, key);
          (config.headers as any)['Content-Type'] = 'text/plain';
        }
      } catch (err) {
        console.error('[E2EE] Request encryption failed:', err);
      }
    }
  }

  return config;
});

// =============================================================================
// RESPONSE INTERCEPTOR — E2EE decryption + 401 handling
// =============================================================================

apiClient.interceptors.response.use(
  async (response) => {
    // Encrypted response arrives as text/plain
    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('text/plain') && typeof response.data === 'string' && response.data.length > 0 && !isExcluded(response.config?.url)) {
      const token = await getToken();
      if (token) {
        try {
          const key = getSessionKey(token);
          if (key) {
            const decrypted = await decrypt(response.data, key);
            response.data = JSON.parse(decrypted);
          }
        } catch (err) {
          console.error('[E2EE] Response decryption failed:', err);
          showSecurityAlert();
          return Promise.reject(new Error('E2EE: Secure communication compromised'));
        }
      }
    }
    return response;
  },
  async (error) => {

    // Try to decrypt encrypted error responses
    const errorContentType = error?.response?.headers?.['content-type'] || '';
    if (errorContentType.includes('text/plain') && error?.response && typeof error.response.data === 'string' && error.response.data.length > 0) {
      const token = await getToken();
      if (token && !isExcluded(error.response.config?.url)) {
        try {
          const key = getSessionKey(token);
          if (key) {
            const decrypted = await decrypt(error.response.data, key);
            error.response.data = JSON.parse(decrypted);
          }
        } catch {
          showSecurityAlert();
        }
      }
    }

    // Handle unauthorized
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      if (unauthorizedHandler) {
        await unauthorizedHandler();
      } else {
        await clearToken();
        clearKeyCache();
      }
      router.replace('/auth/login');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
