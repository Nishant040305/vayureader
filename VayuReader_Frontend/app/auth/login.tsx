import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDeviceId } from '@/lib/deviceId';

import { icons } from '@/constants/icons';
import { images } from '@/constants/images';
import { AUTH_BASE_URL } from '@/constants/config';
import apiClient from '@/lib/apiClient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const LoginScreen = () => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOtp = async () => {
    // console.log('AUTH_BASE_URL', AUTH_BASE_URL);
    const trimmedName = name.trim();
    const trimmedPhone = phoneNumber.trim();
    setError('');

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (!/^[0-9]{10}$/.test(trimmedPhone)) {
      setError('Enter a valid 10 digit phone number');
      return;
    }

    try {
      setLoading(true);
      const deviceId = await getDeviceId();
      const response = await apiClient.post(
        '/api/auth/login/request-otp',
        { name: trimmedName, phone_number: trimmedPhone, deviceId },
        { baseURL: AUTH_BASE_URL }
      );

      // Extract loginToken from response for secure OTP verification
      const loginToken = response.data?.data?.loginToken || '';

      router.push({
        pathname: '/auth/otp',
        params: { phone_number: trimmedPhone, name: trimmedName, deviceId, loginToken },
      });
    } catch (err: any) {
      const endpoint = `${AUTH_BASE_URL}/api/auth/login/request-otp`;
      const statusCode = err?.response?.status || 'No status';
      const serverMessage = err?.response?.data?.message;
      const errorMessage = err?.message;
      const message = serverMessage || errorMessage || 'Failed to request OTP. Please try again.';
      setError(message);
      Alert.alert(
        'Failed to send OTP',
        `Error: ${message}\n\nEndpoint: ${endpoint}\nStatus: ${statusCode}\nTrace: ${errorMessage || 'No trace'}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={images.bg} className="flex-1 bg-black" resizeMode="stretch">
      <KeyboardAvoidingView
        className="flex-1"
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 bg-black/65 px-6 justify-center min-h-screen">
            <View className="items-center mb-10">
              <Image source={icons.logo} className="w-28 h-28" resizeMode="contain" />
              <Text className="text-white text-3xl font-extrabold mt-6">Welcome</Text>
              <Text className="text-gray-300 mt-2">Gateway to Documents, Dictionary, Abbreviation</Text>
            </View>

            <View className="gap-4 mb-10">
              <View className="bg-[#1c1731] rounded-2xl px-4 py-3 border border-[#2a2540]">
                <Text className="text-gray-300 text-sm mb-1">Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor="#7c86aa"
                  className="text-white text-base"
                  autoCapitalize="words"
                />
              </View>

              <View className="bg-[#1c1731] rounded-2xl px-4 py-3 border border-[#2a2540]">
                <Text className="text-gray-300 text-sm mb-1">Phone Number</Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(text.replace(/[^0-9]/g, ''))}
                  placeholder="10 digit phone number"
                  placeholderTextColor="#7c86aa"
                  className="text-white text-base tracking-widest"
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>

              {error ? <Text className="text-red-400 text-sm">{error}</Text> : null}

              <TouchableOpacity
                className="bg-[#1E1B3A] rounded-2xl py-3 mt-2 border border-[#3b3560]"
                activeOpacity={0.85}
                onPress={requestOtp}
                disabled={loading}
              >
                <Text className="text-center text-white text-lg font-bold">
                  {loading ? 'Sending...' : 'Login'}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center my-3">
                <View className="flex-1 h-px bg-gray-800" />
                <Text className="text-gray-500 text-xs px-3 font-semibold uppercase">or</Text>
                <View className="flex-1 h-px bg-gray-800" />
              </View>

              <TouchableOpacity
                className="flex-row items-center justify-center bg-[#131124] rounded-2xl py-3.5 border border-[#3b3560]"
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/offline');
                }}
              >
                <Ionicons name="folder-open-outline" size={20} color="#5B5FEF" style={{ marginRight: 8 }} />
                <Text className="text-white text-base font-bold">
                  View Offline Files
                </Text>
              </TouchableOpacity>
            </View>
            <View className="items-center mb-10">
              <Text className="text-gray-400 text-xs font-extrabold text-center">
                Developed and maintained by 820 SU, AF Stn Bamrauli
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default LoginScreen;
