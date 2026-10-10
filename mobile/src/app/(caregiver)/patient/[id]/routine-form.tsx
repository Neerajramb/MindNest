import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { usePatientWrite, useRoutines } from '@/api/hooks';
import { FormScreen } from '@/components/form-screen';
import { REPEAT_OPTIONS, asRepeatRule, type RepeatRule } from '@/lib/recurrence';
import { TextField } from '@/ui/form';
import { PickerField, fromClock, toClock } from '@/ui/picker-field';
import { Segmented } from '@/ui/segmented';
import { AppText } from '@/ui/text';
import { space } from '@/ui/theme';

export default function RoutineForm() {
  const router = useRouter();
  const { id, routineId } = useLocalSearchParams<{ id: string; routineId?: string }>();
  const existing = useRoutines(id).data?.find((r) => r.id === routineId);
  const write = usePatientWrite(id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [time, setTime] = useState(fromClock(existing?.scheduled_time));
  const [rule, setRule] = useState<RepeatRule>(asRepeatRule(existing?.recurrence_rule));
  const [reminder, setReminder] = useState(existing?.reminder_enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Give the routine a name.');
      return;
    }
    setError(null);
    const body = { title: title.trim(), notes: notes.trim(), scheduled_time: toClock(time), recurrence_rule: rule, reminder_enabled: reminder };
    try {
      await write.mutateAsync(
        existing ? { path: `/schedule/${existing.id}`, method: 'PATCH', body } : { path: `/patients/${id}/schedule`, method: 'POST', body },
      );
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('recurrence_rule') ?? err.fieldError('title') ?? err.message) : errorMessage(err));
    }
  };

  return (
    <FormScreen
      onSave={save}
      saving={write.isPending}
      error={error}
      confirmTitle={existing ? 'Save changes?' : 'Add this routine?'}
      confirmMessage={`The patient will be reminded at ${toClock(time)}.`}
    >
      <TextField label="What" value={title} onChangeText={setTitle} placeholder="e.g. Morning walk" />
      <PickerField label="Time" mode="time" value={time} onChange={setTime} />
      <View style={{ gap: space.xs }}>
        <AppText variant="bodyStrong">Repeats</AppText>
        <Segmented label="Repeats" value={rule} onChange={setRule} options={REPEAT_OPTIONS.map((o) => ({ ...o }))} />
      </View>
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          Remind the patient
        </AppText>
        <Switch accessibilityLabel="Remind the patient" value={reminder} onValueChange={setReminder} />
      </View>
    </FormScreen>
  );
}
