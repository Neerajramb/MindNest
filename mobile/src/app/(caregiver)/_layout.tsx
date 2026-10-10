import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/auth-context';
import { useCaregiverAlertWatcher } from '@/features/caregiver-alerts';
import { colors } from '@/ui/theme';

export default function CaregiverLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const isCaregiver = user?.role === 'CAREGIVER';
  useCaregiverAlertWatcher(isCaregiver);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.url === '/alerts') router.push('/alerts');
    });
    return () => sub.remove();
  }, [router]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!isCaregiver) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-patient" options={{ title: 'Add a patient', presentation: 'modal' }} />
      <Stack.Screen name="patient/[id]/index" options={{ title: 'Patient' }} />
      <Stack.Screen name="patient/[id]/schedule" options={{ title: 'Daily schedule' }} />
      <Stack.Screen name="patient/[id]/medications" options={{ title: 'Medications' }} />
      <Stack.Screen name="patient/[id]/reminders" options={{ title: 'Reminder status' }} />
      <Stack.Screen name="patient/[id]/safety" options={{ title: 'Location & safe zones' }} />
      <Stack.Screen name="patient/[id]/activity" options={{ title: 'Activity' }} />
      <Stack.Screen name="patient/[id]/contacts" options={{ title: 'Emergency contacts' }} />
      <Stack.Screen name="patient/[id]/people" options={{ title: 'Familiar people' }} />
      <Stack.Screen name="patient/[id]/objects" options={{ title: 'Belongings & rooms' }} />
      <Stack.Screen name="patient/[id]/routine-form" options={{ title: 'Routine', presentation: 'modal' }} />
      <Stack.Screen name="patient/[id]/appointment-form" options={{ title: 'Appointment', presentation: 'modal' }} />
      <Stack.Screen name="patient/[id]/medication-form" options={{ title: 'Medication', presentation: 'modal' }} />
    </Stack>
  );
}
