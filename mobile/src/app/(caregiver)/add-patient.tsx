import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { usePatientWrite } from '@/api/hooks';
import type { Patient } from '@/api/types';
import { LinkCodeCard } from '@/components/link-code-card';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';

const DEFAULT_TZ = 'Asia/Kolkata';

export default function AddPatient() {
  const router = useRouter();
  const write = usePatientWrite<Record<string, string>, Patient>('new');
  const [form, setForm] = useState({ display_name: '', preferred_name: '', timezone: DEFAULT_TZ });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Patient | null>(null);

  const save = async () => {
    if (!form.display_name.trim()) {
      setError('Enter the patient’s name.');
      return;
    }
    setError(null);
    try {
      const patient = await write.mutateAsync({
        path: '/patients',
        method: 'POST',
        body: { ...form, display_name: form.display_name.trim(), preferred_name: form.preferred_name.trim() },
      });
      setCreated(patient);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('timezone') ?? err.message) : errorMessage(err));
    }
  };

  if (created?.link_code) {
    return (
      <Screen>
        <LinkCodeCard name={created.display_name} code={created.link_code.code} expiresAt={created.link_code.expires_at} />
        <Button
          label="Share the code"
          tone="secondary"
          onPress={() =>
            void Share.share({
              message: `Your MindNest link code is ${created.link_code?.code}. Open MindNest, choose "I have a link code" and enter it.`,
            })
          }
        />
        <Button
          label="Open patient page"
          icon="forward"
          onPress={() => router.replace({ pathname: '/patient/[id]', params: { id: created.id } })}
        />
      </Screen>
    );
  }

  return (
    <FormScreen
      onSave={save}
      saving={write.isPending}
      error={error}
      confirmTitle="Add this patient?"
      confirmMessage="You will become their primary caregiver and get a code for their phone."
      saveLabel="Add patient"
    >
      <TextField label="Full name" value={form.display_name} onChangeText={(v) => setForm({ ...form, display_name: v })} />
      <TextField
        label="What they like to be called"
        hint="Used in greetings, e.g. Thomas"
        value={form.preferred_name}
        onChangeText={(v) => setForm({ ...form, preferred_name: v })}
      />
      <TextField
        label="Timezone"
        hint="Reminders follow this clock."
        value={form.timezone}
        onChangeText={(v) => setForm({ ...form, timezone: v })}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </FormScreen>
  );
}
