import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { ApiError, errorMessage } from '@/api/client';
import { useAppointments, usePatient, usePatientWrite } from '@/api/hooks';
import { FormScreen } from '@/components/form-screen';
import { formatDateTime } from '@/lib/time';
import { TextField } from '@/ui/form';
import { PickerField } from '@/ui/picker-field';

function defaultStart(): Date {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(10, 0, 0, 0);
  return date;
}

export default function AppointmentForm() {
  const router = useRouter();
  const { id, appointmentId } = useLocalSearchParams<{ id: string; appointmentId?: string }>();
  const tz = usePatient(id).data?.timezone;
  const existing = useAppointments(id).data?.find((a) => a.id === appointmentId);
  const write = usePatientWrite(id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [start, setStart] = useState(existing ? new Date(existing.start_at) : defaultStart());
  const [location, setLocation] = useState(existing?.location ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Give the appointment a title.');
      return;
    }
    if (start.getTime() < Date.now()) {
      setError('Choose a time in the future.');
      return;
    }
    setError(null);
    const body = { title: title.trim(), start_at: start.toISOString(), location: location.trim(), notes: notes.trim() };
    try {
      await write.mutateAsync(
        existing
          ? { path: `/appointments/${existing.id}`, method: 'PATCH', body }
          : { path: `/patients/${id}/appointments`, method: 'POST', body },
      );
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('start_at') ?? err.message) : errorMessage(err));
    }
  };

  return (
    <FormScreen
      onSave={save}
      saving={write.isPending}
      error={error}
      confirmTitle={existing ? 'Save changes?' : 'Add this appointment?'}
      confirmMessage={`${title || 'Appointment'} on ${formatDateTime(start.toISOString(), tz)} (patient's time). They will be reminded an hour before.`}
    >
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Doctor visit" />
      {/* Picked in the patient's timezone so the time means the same for them. */}
      <PickerField label="Date" mode="date" value={start} onChange={setStart} timeZone={tz} minimumDate={new Date()} />
      <PickerField label="Time" mode="time" value={start} onChange={setStart} timeZone={tz} />
      <TextField label="Where (optional)" value={location} onChangeText={setLocation} placeholder="e.g. Room 4, City Clinic" />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
    </FormScreen>
  );
}
