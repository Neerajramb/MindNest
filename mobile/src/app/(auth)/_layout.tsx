import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { colors } from '@/ui/theme';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerShown: false }} />
      <Stack.Screen name="register-patient" options={{ title: 'Set up my account' }} />
      <Stack.Screen name="register-caregiver" options={{ title: 'Create caregiver account' }} />
    </Stack>
  );
}
