import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { qk, useMyPatient, useReminders } from '@/api/hooks';
import { useAuth } from '@/auth/auth-context';
import { useLocationReporting } from '@/features/location-reporting';
import { usePatientId } from '@/features/patient-context';
import { useReminderNotifications } from '@/features/reminder-notifications';
import { TextScaleProvider } from '@/ui/text-scale';
import { colors } from '@/ui/theme';

export default function PatientLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const patientId = usePatientId();
  const isPatient = user?.role === 'PATIENT';
  const me = useMyPatient(isPatient);
  const reminders = useReminders(isPatient ? patientId : undefined);

  useReminderNotifications(reminders.data);
  const onReported = useCallback(() => {
    if (patientId) void client.invalidateQueries({ queryKey: qk.safety(patientId) });
  }, [client, patientId]);
  useLocationReporting(patientId, !!me.data?.location_sharing_enabled, onReported);

  // Tapping a reminder notification opens the reminders tab.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url === '/reminders') router.push('/reminders');
    });
    return () => sub.remove();
  }, [router]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!isPatient) return <Redirect href="/" />;

  return (
    <TextScaleProvider scale={Number(me.data?.text_scale ?? 1)}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontSize: 22, color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="medications" options={{ title: 'My medicines' }} />
        <Stack.Screen name="safety" options={{ title: 'Where am I' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="help" options={{ title: 'Help' }} />
        <Stack.Screen name="who-is-this" options={{ title: 'Who is this?' }} />
      </Stack>
    </TextScaleProvider>
  );
}
