import { useAuth } from '@/auth/auth-context';

/** The signed-in patient's own id (from the token's user record; the server re-checks it on every call). */
export function usePatientId(): string | undefined {
  return useAuth().user?.patient_id ?? undefined;
}
