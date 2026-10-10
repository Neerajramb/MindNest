import { useMutation } from '@tanstack/react-query';
import { Alert, Linking, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { useEmergencyContacts } from '@/api/hooks';
import { usePatientId } from '@/features/patient-context';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

const EMERGENCY_NUMBER = '112'; // India's single emergency number

/** P-15 Help / Emergency. MindNest supports the patient but does not replace emergency services (BR-08). */
export default function Help() {
  const patientId = usePatientId();
  const contacts = useEmergencyContacts(patientId);
  const sos = useMutation({ mutationFn: () => api<{ alert_id: string }>('/sos', { method: 'POST' }) });

  const call = (phone: string) => void Linking.openURL(`tel:${phone}`);

  const askForHelp = () =>
    Alert.alert('Tell your caregivers you need help?', 'They will get an alert with where your phone was last seen.', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, get help', style: 'destructive', onPress: () => sos.mutate() },
    ]);

  return (
    <Screen>
      <Button label="I need help" tone="danger" icon="help" onPress={askForHelp} loading={sos.isPending} large />
      {sos.isSuccess ? (
        <Card tint={colors.successSoft}>
          <AppText variant="title">Your caregivers have been told</AppText>
          <AppText>Stay where you are if you can. You can also call someone below.</AppText>
        </Card>
      ) : null}
      {sos.isError ? (
        <InlineNotice tone="danger" message={`Could not send the alert: ${errorMessage(sos.error)} Please call someone instead.`} />
      ) : null}

      <View style={{ gap: space.md }}>
        <AppText variant="title" accessibilityRole="header">
          Call someone
        </AppText>
        {contacts.isLoading ? <LoadingState /> : null}
        {contacts.data?.map((c) => (
          <Button
            key={c.id}
            label={`Call ${c.name}${c.relationship ? ` (${c.relationship})` : ''}`}
            icon="phone"
            tone="secondary"
            onPress={() => call(c.phone)}
            large
          />
        ))}
        {contacts.data && contacts.data.length === 0 ? (
          <AppText color={colors.textMuted}>No contacts yet. Your caregiver can add them.</AppText>
        ) : null}
        <Button label={`Emergency services (${EMERGENCY_NUMBER})`} icon="phone" tone="danger" onPress={() => call(EMERGENCY_NUMBER)} large />
      </View>

      <Card>
        <AppText variant="title">How MindNest works</AppText>
        <AppText>
          MindNest reminds you about your day and your medicines, shows your plans, and lets your caregiver know if
          you need help. It helps you, but it is not a doctor and cannot replace emergency services.
        </AppText>
      </Card>
    </Screen>
  );
}
