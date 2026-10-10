import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { useEmergencyContacts, usePatient, usePatientWrite } from '@/api/hooks';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';
import { EmptyState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

/** Emergency contacts shown on the patient's Help screen (P-15). */
export default function Contacts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const patient = usePatient(id);
  const contacts = useEmergencyContacts(id);
  const write = usePatientWrite(id);
  const [form, setForm] = useState({ name: '', phone: '', relationship: '' });
  const [error, setError] = useState<string | null>(null);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');

  const add = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Enter a name and phone number.');
      return;
    }
    setError(null);
    try {
      await write.mutateAsync({ path: `/patients/${id}/emergency-contacts`, method: 'POST', body: form });
      setForm({ name: '', phone: '', relationship: '' });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('phone') ?? err.message) : errorMessage(err));
    }
  };

  const remove = (contactId: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'They will no longer appear on the Help screen.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => write.mutateAsync({ path: `/emergency-contacts/${contactId}`, method: 'DELETE' }).catch((e) => Alert.alert('Could not remove', errorMessage(e))),
      },
    ]);

  return (
    <Screen>
      {contacts.isLoading ? <LoadingState /> : null}
      {contacts.data?.length === 0 ? <EmptyState icon="phone" title="No emergency contacts" /> : null}
      {contacts.data?.map((c) => (
        <Card key={c.id}>
          <AppText variant="bodyStrong">{c.name}</AppText>
          <AppText selectable>{c.phone}</AppText>
          {c.relationship ? <AppText color={colors.textMuted}>{c.relationship}</AppText> : null}
          {canEdit ? <Button label="Remove" tone="ghost" icon="trash" onPress={() => remove(c.id, c.name)} /> : null}
        </Card>
      ))}
      {canEdit ? (
        <Card>
          <AppText variant="title">Add a contact</AppText>
          <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <TextField label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
          <TextField label="Relationship" value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} placeholder="e.g. Daughter" />
          {error ? <InlineNotice tone="danger" message={error} /> : null}
          <Button label="Add contact" icon="add" onPress={add} loading={write.isPending} />
        </Card>
      ) : null}
    </Screen>
  );
}
