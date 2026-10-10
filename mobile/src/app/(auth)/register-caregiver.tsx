import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { InlineNotice } from '@/ui/states';
import { colors, space } from '@/ui/theme';

type Field = 'name' | 'username' | 'email' | 'password' | 'form';

export default function RegisterCaregiver() {
  const router = useRouter();
  const { registerCaregiver } = useAuth();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const local: Partial<Record<Field, string>> = {};
    if (!form.name.trim()) local.name = 'Enter your name.';
    if (form.username.trim().length < 3) local.username = 'Use at least 3 characters.';
    if (form.password.length < 8) local.password = 'Use at least 8 characters.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await registerCaregiver({
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setErrors({
          name: err.fieldError('name') ?? undefined,
          username: err.fieldError('username') ?? undefined,
          email: err.fieldError('email') ?? undefined,
          password: err.fieldError('password') ?? err.fieldError('non_field_errors') ?? undefined,
        });
      } else {
        setErrors({ form: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.xl, gap: space.lg }}
      >
        <TextField label="Your name" value={form.name} onChangeText={set('name')} textContentType="name" error={errors.name} />
        <TextField
          label="Username"
          value={form.username}
          onChangeText={set('username')}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          error={errors.username}
        />
        <TextField
          label="Email (optional)"
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={errors.email}
        />
        <TextField
          label="Password"
          hint="At least 8 characters; avoid common words."
          value={form.password}
          onChangeText={set('password')}
          secureTextEntry
          textContentType="newPassword"
          error={errors.password}
        />
        {errors.form ? <InlineNotice tone="danger" message={errors.form} /> : null}
        <Button label="Create account" icon="check" onPress={submit} loading={busy} large />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
