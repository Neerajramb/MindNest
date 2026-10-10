import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { useAgenda, useMedications, usePatient, usePatientAlerts, useReminders, useSafety } from '@/api/hooks';
import { AgendaRow } from '@/components/agenda-row';
import { AlertCard } from '@/components/alert-card';
import { LinkCodeCard } from '@/components/link-code-card';
import { SafetyBadge } from '@/components/safety-status';
import { Button } from '@/ui/button';
import { Card, NavRow } from '@/ui/card';
import { NamedIcon, type IconName } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-03 Patient overview: one patient's status with direct links to each management area. */
export default function PatientOverview() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = usePatient(id);
  const agenda = useAgenda(id);
  const reminders = useReminders(id);
  const meds = useMedications(id);
  const safety = useSafety(id, 30_000);
  const alerts = usePatientAlerts(id);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);

  if (patient.isLoading) return <LoadingState />;
  if (!patient.data) return <ErrorState message={errorMessage(patient.error)} onRetry={() => void patient.refetch()} />;
  const p = patient.data;
  const tz = p.timezone;
  const canEdit = p.my_permission_level === 'EDITOR' || p.my_permission_level === 'PRIMARY';

  const today = reminders.data ?? [];
  const counts = {
    done: today.filter((r) => r.status === 'ACKNOWLEDGED').length,
    missed: today.filter((r) => r.status === 'MISSED').length,
  };
  const openAlerts = (alerts.data ?? []).filter((a) => !a.acknowledged_at);

  const newCode = async () => {
    try {
      setCode(await api<{ code: string; expires_at: string }>(`/patients/${id}/link-codes`, { method: 'POST' }));
    } catch (err) {
      Alert.alert('Could not create a code', errorMessage(err));
    }
  };

  const links: { href: Href; icon: IconName; title: string; detail: string }[] = [
    { href: { pathname: '/patient/[id]/schedule', params: { id } }, icon: 'schedule', title: 'Daily schedule & appointments', detail: 'Routines and calendar' },
    { href: { pathname: '/patient/[id]/medications', params: { id } }, icon: 'medication', title: 'Medications', detail: `${meds.data?.length ?? 0} active` },
    { href: { pathname: '/patient/[id]/reminders', params: { id } }, icon: 'reminders', title: 'Reminder status', detail: `${counts.done} done · ${counts.missed} missed (last 24 h)` },
    { href: { pathname: '/patient/[id]/safety', params: { id } }, icon: 'safety', title: 'Location & safe zones', detail: 'Map, zones and alerts' },
    { href: { pathname: '/patient/[id]/people', params: { id } }, icon: 'people', title: 'Familiar people', detail: 'Faces for “Who is this?”' },
    { href: { pathname: '/patient/[id]/objects', params: { id } }, icon: 'more', title: 'Belongings & rooms', detail: 'Last seen places' },
    { href: { pathname: '/patient/[id]/memories', params: { id } }, icon: 'speaker', title: 'Conversations', detail: 'What the patient chooses to share' },
    { href: { pathname: '/patient/[id]/contacts', params: { id } }, icon: 'phone', title: 'Emergency contacts', detail: 'Shown on their Help screen' },
    { href: { pathname: '/patient/[id]/activity', params: { id } }, icon: 'activity', title: 'Activity', detail: 'What happened recently' },
  ];

  return (
    <Screen
      refreshing={patient.isRefetching}
      onRefresh={() => {
        void patient.refetch();
        void agenda.refetch();
        void reminders.refetch();
        void safety.refetch();
        void alerts.refetch();
      }}
    >
      <Stack.Screen options={{ title: p.display_name }} />
      <View style={{ gap: space.xs }}>
        <AppText variant="heading">{p.display_name}</AppText>
        <AppText color={colors.textMuted}>
          Your access: {p.my_permission_level?.toLowerCase() ?? 'viewer'} · Timezone {tz}
        </AppText>
      </View>

      {!p.has_account ? (
        code ? (
          <LinkCodeCard name={p.display_name} code={code.code} expiresAt={code.expires_at} />
        ) : (
          <Card tint={colors.warningSoft}>
            <AppText variant="bodyStrong">Their app is not set up yet</AppText>
            <AppText color={colors.textMuted}>Create a link code and enter it on their phone.</AppText>
            {p.my_permission_level === 'PRIMARY' ? <Button label="Create link code" onPress={newCode} /> : null}
          </Card>
        )
      ) : null}

      {openAlerts.length ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="title">Open alerts</AppText>
          {openAlerts.slice(0, 3).map((a) => (
            <AlertCard key={a.id} alert={a} onOpen={() => router.push('/alerts')} />
          ))}
        </View>
      ) : null}

      {safety.data ? <SafetyBadge summary={safety.data} audience="caregiver" /> : null}

      <View style={{ gap: space.sm }}>
        <AppText variant="title">Today</AppText>
        {agenda.isLoading ? <LoadingState /> : null}
        {agenda.data?.items.length === 0 ? <AppText color={colors.textMuted}>Nothing scheduled today.</AppText> : null}
        {agenda.data?.items.map((item) => (
          <AgendaRow key={`${item.source_id}-${item.at}`} item={item} timeZone={tz} />
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        {links.map((link) => (
          <NavRow key={link.title} accessibilityLabel={`${link.title}. ${link.detail}`} onPress={() => router.push(link.href)}>
            <NamedIcon name={link.icon} color={colors.primary} size={28} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{link.title}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {link.detail}
              </AppText>
            </View>
          </NavRow>
        ))}
      </View>
      {!canEdit ? (
        <AppText variant="caption" color={colors.textMuted}>
          You have view-only access to this patient.
        </AppText>
      ) : null}
    </Screen>
  );
}
