import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { apiBaseUrl, errorMessage } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { setServerOverride } from '@/auth/session';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/form';
import { Segmented } from '@/ui/segmented';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

type RoleChoice = 'PATIENT' | 'CAREGIVER';

/** P-01 / C-01: one sign-in for both roles; the account's role decides which app opens. */
export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [role, setRole] = useState<RoleChoice>('PATIENT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(apiBaseUrl());

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveServer = async () => {
    const value = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+\/api\/v1$/.test(value)) {
      setError('The server address must look like http://192.168.1.20:8000/api/v1');
      return;
    }
    await setServerOverride(value);
    setError(null);
    setShowServer(false);
  };

  const forgot = () =>
    Alert.alert(
      'Forgot your password?',
      role === 'PATIENT'
        ? 'Ask your caregiver to help you. They can give you a new link code to set up your account again.'
        : 'Contact the person who manages MindNest for your family or clinic to reset your password.',
    );

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingTop: space.xxl * 2 }}
      >
        <View style={{ gap: space.sm }}>
          <AppText variant="display" accessibilityRole="header">
            MindNest
          </AppText>
          <AppText color={colors.textMuted}>Your daily companion for reminders, routines and staying safe.</AppText>
        </View>

        <Segmented
          label="I am a"
          value={role}
          onChange={setRole}
          options={[
            { value: 'PATIENT', label: 'Patient' },
            { value: 'CAREGIVER', label: 'Caregiver' },
          ]}
        />

        <View style={{ gap: space.lg }}>
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error ? <InlineNotice tone="danger" message={error} /> : null}
          <Button label="Sign in" icon="forward" onPress={submit} loading={busy} large />
          <Button label="Forgot password?" tone="ghost" onPress={forgot} />
        </View>

        <View style={{ gap: space.md }}>
          {role === 'PATIENT' ? (
            <Button
              label="I have a link code"
              tone="secondary"
              icon="person"
              onPress={() => router.push('/register-patient')}
              accessibilityHint="Set up your account with the code your caregiver gave you"
            />
          ) : (
            <Button
              label="Create caregiver account"
              tone="secondary"
              icon="add"
              onPress={() => router.push('/register-caregiver')}
            />
          )}
        </View>

        <View style={{ gap: space.md }}>
          <Button label={showServer ? 'Hide server address' : 'Server address'} tone="ghost" onPress={() => setShowServer(!showServer)} />
          {showServer ? (
            <>
              <TextField
                label="Server address"
                hint="Only needed when testing on a local network."
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Button label="Save server address" tone="secondary" onPress={saveServer} />
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
