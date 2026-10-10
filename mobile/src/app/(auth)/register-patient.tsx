import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

type Errors = Partial<Record<'link_code' | 'username' | 'password' | 'form', string>>;

/** Caregiver-invited registration (wireframe "Register"): the link code ties the account to the patient profile. */
export default function RegisterPatient() {
  const router = useRouter();
  const { registerPatient } = useAuth();
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const local: Errors = {};
    if (code.trim().length < 6) local.link_code = 'Enter the code from your caregiver.';
    if (username.trim().length < 3) local.username = 'Choose a username with at least 3 letters.';
    if (password.length < 8) local.password = 'Use at least 8 characters.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await registerPatient({ link_code: code.trim().toUpperCase(), username: username.trim(), password });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setErrors({
          link_code: err.fieldError('link_code') ?? undefined,
          username: err.fieldError('username') ?? undefined,
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
        <AppText color={colors.textMuted}>
          Your caregiver gave you an 8-letter code. Enter it here, then choose a username and password you will
          remember.
        </AppText>
        <TextField
          label="Link code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          error={errors.link_code}
        />
        <TextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          error={errors.username}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          error={errors.password}
        />
        {errors.form ? <InlineNotice tone="danger" message={errors.form} /> : null}
        <Button label="Set up my account" icon="check" onPress={submit} loading={busy} large />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
