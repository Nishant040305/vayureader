import { AuthProvider } from '@/contexts/AuthContext';
import { Stack } from "expo-router";
import './globals.css';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pdfread/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="word/[word]" options={{ headerShown: false }} />
        <Stack.Screen name="offline" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
