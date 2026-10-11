import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import type {
  ActivityEntry,
  Agenda,
  AlertItem,
  Appointment,
  CaregiverLink,
  EmergencyContact,
  Geofence,
  Medication,
  Patient,
  Reminder,
  Routine,
  SafetySummary,
} from '@/api/types';

/** Query keys are namespaced by patient so invalidation stays precise. */
export const qk = {
  me: ['patients', 'me'] as const,
  patients: ['patients'] as const,
  patient: (id: string) => ['patient', id] as const,
  agenda: (id: string, date?: string) => ['patient', id, 'agenda', date ?? 'today'] as const,
  reminders: (id: string) => ['patient', id, 'reminders'] as const,
  routines: (id: string) => ['patient', id, 'routines'] as const,
  appointments: (id: string) => ['patient', id, 'appointments'] as const,
  medications: (id: string) => ['patient', id, 'medications'] as const,
  safety: (id: string) => ['patient', id, 'safety'] as const,
  geofences: (id: string) => ['patient', id, 'geofences'] as const,
  contacts: (id: string) => ['patient', id, 'contacts'] as const,
  activity: (id: string) => ['patient', id, 'activity'] as const,
  caregivers: (id: string) => ['patient', id, 'caregivers'] as const,
  patientAlerts: (id: string) => ['patient', id, 'alerts'] as const,
  myAlerts: ['alerts', 'mine'] as const,
};

// ---------- reads ----------

export const useMyPatient = (enabled = true) =>
  useQuery({ queryKey: qk.me, queryFn: () => api<Patient>('/patients/me'), enabled });

export const usePatients = () => useQuery({ queryKey: qk.patients, queryFn: () => api<Patient[]>('/patients') });

export const usePatient = (id: string) =>
  useQuery({ queryKey: qk.patient(id), queryFn: () => api<Patient>(`/patients/${id}`) });

export const useAgenda = (id: string | undefined, date?: string) =>
  useQuery({
    queryKey: qk.agenda(id ?? '', date),
    queryFn: () => api<Agenda>(`/patients/${id}/agenda${date ? `?date=${date}` : ''}`),
    enabled: !!id,
  });

export const useReminders = (id: string | undefined) =>
  useQuery({
    queryKey: qk.reminders(id ?? ''),
    queryFn: () => api<Reminder[]>(`/patients/${id}/reminders`),
    enabled: !!id,
    refetchInterval: 60_000,
  });

export const useRoutines = (id: string) =>
  useQuery({ queryKey: qk.routines(id), queryFn: () => api<Routine[]>(`/patients/${id}/schedule`) });

export const useAppointments = (id: string) =>
  useQuery({
    queryKey: qk.appointments(id),
    queryFn: () => api<Appointment[]>(`/patients/${id}/appointments?upcoming=true`),
  });

export const useMedications = (id: string | undefined) =>
  useQuery({
    queryKey: qk.medications(id ?? ''),
    queryFn: () => api<Medication[]>(`/patients/${id}/medications`),
    enabled: !!id,
  });

export const useSafety = (id: string | undefined, refetchInterval?: number) =>
  useQuery({
    queryKey: qk.safety(id ?? ''),
    queryFn: () => api<SafetySummary>(`/patients/${id}/safety`),
    enabled: !!id,
    refetchInterval,
  });

export const useGeofences = (id: string) =>
  useQuery({ queryKey: qk.geofences(id), queryFn: () => api<Geofence[]>(`/patients/${id}/geofences`) });

export const useEmergencyContacts = (id: string | undefined) =>
  useQuery({
    queryKey: qk.contacts(id ?? ''),
    queryFn: () => api<EmergencyContact[]>(`/patients/${id}/emergency-contacts`),
    enabled: !!id,
  });

export const useActivity = (id: string) =>
  useQuery({ queryKey: qk.activity(id), queryFn: () => api<ActivityEntry[]>(`/patients/${id}/activity`) });

export const useCaregivers = (id: string) =>
  useQuery({ queryKey: qk.caregivers(id), queryFn: () => api<CaregiverLink[]>(`/patients/${id}/caregivers`) });

export const usePatientAlerts = (id: string) =>
  useQuery({ queryKey: qk.patientAlerts(id), queryFn: () => api<AlertItem[]>(`/patients/${id}/alerts`) });

/** Caregiver alert feed, polled while the app is open (ADR-0008). */
export const useMyAlerts = (enabled: boolean) =>
  useQuery({
    queryKey: qk.myAlerts,
    queryFn: () => api<AlertItem[]>('/alerts?unacknowledged=true'),
    enabled,
    refetchInterval: 20_000,
  });

// ---------- writes ----------

/** Invalidate everything for one patient after a change (schedule edits affect agenda + reminders). */
function useInvalidatePatient() {
  const client = useQueryClient();
  return (patientId: string) => client.invalidateQueries({ queryKey: ['patient', patientId] });
}

export function useAcknowledgeReminder(patientId: string | undefined) {
  const invalidate = useInvalidatePatient();
  return useMutation({
    mutationFn: (reminderId: string) => api<Reminder>(`/reminders/${reminderId}/acknowledge`, { method: 'POST' }),
    onSuccess: () => patientId && invalidate(patientId),
  });
}

export function useSnoozeReminder(patientId: string | undefined) {
  const invalidate = useInvalidatePatient();
  return useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      api<Reminder>(`/reminders/${id}/snooze`, { method: 'POST', body: { minutes } }),
    onSuccess: () => patientId && invalidate(patientId),
  });
}

/** Generic patient-scoped create/update/delete used by the caregiver forms. */
export function usePatientWrite<TBody, TResult = unknown>(patientId: string) {
  const invalidate = useInvalidatePatient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH' | 'DELETE'; body?: TBody }) =>
      api<TResult>(path, { method, body }),
    onSuccess: () => {
      void invalidate(patientId);
      void client.invalidateQueries({ queryKey: qk.patients });
    },
  });
}

export function useAcknowledgeAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => api<AlertItem>(`/alerts/${alertId}/acknowledge`, { method: 'POST' }),
    onSuccess: (alert) => {
      void client.invalidateQueries({ queryKey: qk.myAlerts });
      void client.invalidateQueries({ queryKey: qk.patientAlerts(alert.patient_id) });
    },
  });
}

/** A reminder the patient adds for themselves: one day (`date`, local YYYY-MM-DD) or every day from it. */
export type NewReminder = { title: string; date: string; time: string; daily?: boolean };

/** Patients add reminders as routines; the server tells their caregivers. */
export function useAddMyReminder(patientId: string | undefined) {
  const invalidate = useInvalidatePatient();
  return useMutation({
    mutationFn: ({ title, date, time, daily }: NewReminder) =>
      api<Routine>(`/patients/${patientId}/schedule`, {
        method: 'POST',
        body: { title, scheduled_time: time, start_date: date, end_date: daily ? null : date, recurrence_rule: 'FREQ=DAILY' },
      }),
    onSuccess: () => patientId && invalidate(patientId),
  });
}
