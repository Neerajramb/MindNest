import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAddMyReminder, useMyPatient } from '@/api/hooks';
import { usePatientId } from '@/features/patient-context';
import { addDays, formatClock, isoDateIn } from '@/lib/time';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { PickerField, fromClock, toClock } from '@/ui/picker-field';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

type When = 'today' | 'tomorrow' | 'daily';
const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'daily', label: 'Every day' },
];

/** The patient adds their own reminder; their caregivers are told about it. */
export default function AddReminder() {
  const router = useRouter();
  const patientId = usePatientId();
  const tz = useMyPatient().data?.timezone;
  const add = useAddMyReminder(patientId);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [time, setTime] = useState(() => fromClock(`${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError('Write what you want to be reminded about.');
    const clock = toClock(time);
    const now = new Date();
    if (when === 'today' && clock <= toClock(now)) return setError('That time has already passed today. Pick a later time or choose Tomorrow.');
    setError(null);
    const today = isoDateIn(tz);
    try {
      await add.mutateAsync({ title: title.trim(), time: clock, date: when === 'tomorrow' ? addDays(today, 1) : today, daily: when === 'daily' });
      router.back();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen>
      <TextField label="What should I remind you about?" value={title} onChangeText={setTitle} placeholder="e.g. Go to the park" />
      <View style={{ gap: space.xs }}>
        <AppText variant="bodyStrong">When</AppText>
        <Segmented label="When" value={when} onChange={setWhen} options={WHEN_OPTIONS} />
      </View>
      <PickerField label="Time" mode="time" value={time} onChange={setTime} />
      {error ? <InlineNotice tone="danger" message={error} /> : null}
      <Button label={`Remind me at ${formatClock(toClock(time))}`} icon="check" onPress={() => void save()} loading={add.isPending} large />
      <AppText variant="caption" color={colors.textMuted}>
        Your caregiver will see that you added this reminder.
      </AppText>
    </Screen>
  );
}
