import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { useMedications, usePatientWrite } from '@/api/hooks';
import type { Medication } from '@/api/types';
import { FormScreen } from '@/components/form-screen';
import { formatClock } from '@/lib/time';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { PickerField, fromClock, toClock } from '@/ui/picker-field';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/**
 * Add or edit a medicine and its daily times. On save, existing times that were removed are deactivated and
 * new ones are created, so reminders follow the new plan immediately.
 */
export default function MedicationForm() {
  const router = useRouter();
  const { id, medicationId } = useLocalSearchParams<{ id: string; medicationId?: string }>();
  const existing = useMedications(id).data?.find((m) => m.id === medicationId);
  const write = usePatientWrite<Record<string, unknown>, Medication>(id);
  const [name, setName] = useState(existing?.name ?? '');
  const [dosage, setDosage] = useState(existing?.dosage_text ?? '');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [times, setTimes] = useState<string[]>(existing?.schedules.map((s) => s.time_of_day.slice(0, 5)) ?? ['09:00']);
  const [picker, setPicker] = useState(fromClock('09:00'));
  const [error, setError] = useState<string | null>(null);

  const addTime = () => {
    const value = toClock(picker);
    if (!times.includes(value)) setTimes([...times, value].sort());
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Enter the medicine name.');
      return;
    }
    if (times.length === 0) {
      setError('Add at least one time so the patient gets reminders.');
      return;
    }
    setError(null);
    const details = { name: name.trim(), dosage_text: dosage.trim(), instructions: instructions.trim() };
    try {
      if (!existing) {
        await write.mutateAsync({
          path: `/patients/${id}/medications`,
          method: 'POST',
          body: { ...details, schedules: times.map((t) => ({ time_of_day: t })) },
        });
      } else {
        await write.mutateAsync({ path: `/medications/${existing.id}`, method: 'PATCH', body: details });
        const current = new Map(existing.schedules.map((s) => [s.time_of_day.slice(0, 5), s.id]));
        for (const [time, scheduleId] of current) {
          if (!times.includes(time)) await write.mutateAsync({ path: `/medication-schedules/${scheduleId}`, method: 'DELETE' });
        }
        for (const time of times) {
          if (!current.has(time)) {
            await write.mutateAsync({ path: `/medications/${existing.id}/schedules`, method: 'POST', body: { time_of_day: time } });
          }
        }
      }
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('name') ?? err.message) : errorMessage(err));
    }
  };

  return (
    <FormScreen
      onSave={save}
      saving={write.isPending}
      error={error}
      confirmTitle={existing ? 'Save medicine changes?' : 'Add this medicine?'}
      confirmMessage={`${name || 'This medicine'}${dosage ? `, ${dosage}` : ''}, at ${times.map(formatClock).join(', ')}. Please double-check the dose.`}
    >
      <TextField label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Metformin" />
      <TextField label="Dose" value={dosage} onChangeText={setDosage} placeholder="e.g. 500mg, 1 tablet" />
      <TextField label="Instructions" value={instructions} onChangeText={setInstructions} placeholder="e.g. Take with breakfast" multiline />
      <View style={{ gap: space.sm }}>
        <AppText variant="bodyStrong">Times each day</AppText>
        {times.length === 0 ? <AppText color={colors.textMuted}>No times yet.</AppText> : null}
        {times.map((t) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <AppText style={{ flex: 1 }}>{formatClock(t)}</AppText>
            <Button label="Remove" tone="ghost" icon="trash" onPress={() => setTimes(times.filter((x) => x !== t))} />
          </View>
        ))}
        <PickerField label="New time" mode="time" value={picker} onChange={setPicker} />
        <Button label="Add this time" tone="secondary" icon="add" onPress={addTime} />
      </View>
    </FormScreen>
  );
}
