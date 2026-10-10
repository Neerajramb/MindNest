import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { qk, useMyPatient } from '@/api/hooks';
import type { MemoryAccess, Patient } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

const TEXT_SIZES = [
  { value: '1.00', label: 'Normal' },
  { value: '1.30', label: 'Large' },
  { value: '1.60', label: 'Largest' },
];

const MEMORY_ACCESS: { value: MemoryAccess; label: string }[] = [
  { value: 'NONE', label: 'Nothing' },
  { value: 'METADATA', label: 'Dates only' },
  { value: 'FULL', label: 'Everything' },
];

/** P-14 Settings: text size, spoken answers, privacy and account. */
export default function Settings() {
  const client = useQueryClient();
  const { user, signOut } = useAuth();
  const me = useMyPatient();
  const [saving, setSaving] = useState(false);

  const update = async (changes: Partial<Patient>) => {
    setSaving(true);
    try {
      const updated = await api<Patient>('/patients/me/settings', { method: 'PATCH', body: changes });
      client.setQueryData(qk.me, updated);
    } catch (err) {
      Alert.alert('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need your username and password to sign in again.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  if (me.isLoading) return <LoadingState />;
  if (!me.data) return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  const scale = Number(me.data.text_scale).toFixed(2);

  return (
    <Screen>
      <Card>
        <AppText variant="title">Text size</AppText>
        <Segmented
          label="Text size"
          value={TEXT_SIZES.some((t) => t.value === scale) ? scale : '1.00'}
          onChange={(value) => void update({ text_scale: value })}
          options={TEXT_SIZES}
        />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Read answers aloud</AppText>
            <AppText color={colors.textMuted}>The assistant speaks its answers.</AppText>
          </View>
          <Switch
            accessibilityLabel="Read answers aloud"
            value={me.data.voice_responses_enabled}
            disabled={saving}
            onValueChange={(value) => void update({ voice_responses_enabled: value })}
          />
        </View>
      </Card>

      <Card>
        <AppText variant="title">What caregivers can see of my conversations</AppText>
        <Segmented
          label="Conversation privacy"
          value={me.data.caregiver_memory_access}
          onChange={(value) => void update({ caregiver_memory_access: value })}
          options={MEMORY_ACCESS}
        />
      </Card>

      <Card>
        <AppText variant="title">Language</AppText>
        <AppText color={colors.textMuted}>English</AppText>
      </Card>

      <Card>
        <AppText variant="title">Account</AppText>
        <AppText selectable>Signed in as {user?.username}</AppText>
        <Button label="Sign out" tone="secondary" icon="logout" onPress={confirmSignOut} />
      </Card>
    </Screen>
  );
}
