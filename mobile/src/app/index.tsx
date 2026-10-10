import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';

/** Role-specific home after sign-in (UC-01, Milestone 1: separate patient and caregiver interfaces). */
export default function Index() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role === 'PATIENT') return <Redirect href="/home" />;
  if (user.role === 'CAREGIVER') return <Redirect href="/dashboard" />;
  return <Redirect href="/sign-in" />;
}
