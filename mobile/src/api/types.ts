/** Types mirror the backend serializers (source of truth: GET /api/schema). */

export type Role = 'PATIENT' | 'CAREGIVER' | 'ADMIN';

export type User = {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  patient_id: string | null;
  caregiver_id: string | null;
};

export type AuthPayload = { access: string; refresh: string; user: User };

export type PermissionLevel = 'VIEWER' | 'EDITOR' | 'PRIMARY';
export type MemoryAccess = 'NONE' | 'METADATA' | 'FULL';

export type Patient = {
  id: string;
  display_name: string;
  preferred_name: string;
  date_of_birth: string | null;
  preferred_language: string;
  timezone: string;
  notes: string;
  caregiver_memory_access: MemoryAccess;
  location_sharing_enabled: boolean;
  text_scale: string;
  voice_responses_enabled: boolean;
  has_account: boolean;
  my_permission_level: PermissionLevel | null;
  created_at: string;
  updated_at: string;
  link_code?: { code: string; expires_at: string };
};

export type EmergencyContact = { id: string; name: string; phone: string; relationship: string; priority: number };

export type ReminderType = 'MEDICATION' | 'APPOINTMENT' | 'ROUTINE' | 'OTHER';
export type ReminderStatus = 'PENDING' | 'SNOOZED' | 'ACKNOWLEDGED' | 'MISSED';

export type Reminder = {
  id: string;
  type: ReminderType;
  source_id: string;
  scheduled_at: string;
  due_at: string;
  message: string;
  detail: string;
  status: ReminderStatus;
  snoozed_until: string | null;
  acknowledged_at: string | null;
  acknowledged_late: boolean;
};

export type AgendaItem = {
  kind: Exclude<ReminderType, 'OTHER'>;
  source_id: string;
  title: string;
  detail: string;
  at: string;
  end_at: string | null;
  location: string;
  reminder: { id: string; status: ReminderStatus; acknowledged_late: boolean } | null;
};

export type Agenda = { date: string; timezone: string; items: AgendaItem[] };

export type Routine = {
  id: string;
  title: string;
  notes: string;
  scheduled_time: string;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  reminder_enabled: boolean;
  is_active: boolean;
};

export type Appointment = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string;
  notes: string;
};

export type MedicationSchedule = {
  id: string;
  time_of_day: string;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type Medication = {
  id: string;
  name: string;
  dosage_text: string;
  instructions: string;
  is_active: boolean;
  schedules: MedicationSchedule[];
};

export type AlertType = 'GEOFENCE' | 'MEDICATION' | 'SOS' | 'LOCATION_UNAVAILABLE' | 'PATIENT_REMINDER' | 'SYSTEM' | 'OTHER';

export type AlertItem = {
  id: string;
  patient_id: string;
  patient_name: string;
  type: AlertType;
  severity: 'INFO' | 'WARNING' | 'HIGH';
  message: string;
  data: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
};

export type ZoneStatus = 'UNKNOWN' | 'INSIDE' | 'OUTSIDE';

export type SafetySummary = {
  status: ZoneStatus;
  zone_name: string | null;
  location_sharing_enabled: boolean;
  has_safe_zones: boolean;
  location_stale: boolean;
  last_location: {
    latitude: number;
    longitude: number;
    accuracy_m: number | null;
    recorded_at: string;
    source: 'GPS' | 'NETWORK' | 'TEST';
    is_mocked: boolean;
  } | null;
};

export type Geofence = {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radius_m: number;
  is_active: boolean;
};

export type ActivityEntry = {
  id: string;
  category: 'ACTIVITY' | 'AUDIT';
  event_type: string;
  event_data: Record<string, unknown>;
  actor_name: string | null;
  actor_role: Role | null;
  created_at: string;
};

export type CaregiverLink = {
  caregiver_id: string;
  name: string;
  username: string;
  permission_level: PermissionLevel;
  is_active: boolean;
};
