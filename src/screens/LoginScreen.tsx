import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, PrimaryButton, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

const ADMIN_USERNAME = 'cricketzone';
const ADMIN_PASSWORD = '123456';

export function LoginScreen({ onAdmin, onViewer }: { onAdmin: () => void; onViewer: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const login = () => {
    if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setPassword('');
      onAdmin();
      return;
    }
    Alert.alert('Login failed', 'Incorrect admin username or password.');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.eyebrow}>CRICKET ZONE</Text>
          <Text style={styles.title}>Local Cricket Scorer</Text>
          <Text style={styles.subtitle}>Choose how you want to enter the scoring app.</Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Admin Access</Text>
            <Text style={styles.sectionText}>Full scoring, setup, import/export and management access.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>USERNAME</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Admin username"
              placeholderTextColor={colors.muted}
              style={styles.input}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Admin password"
              placeholderTextColor={colors.muted}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={login}
            />
          </View>

          <PrimaryButton label="Login as Admin" onPress={login} />
        </Card>

        <View style={styles.separatorRow}>
          <View style={styles.separator} />
          <Text style={styles.or}>OR</Text>
          <View style={styles.separator} />
        </View>

        <Card style={styles.viewerCard}>
          <Text style={styles.sectionTitle}>View Access</Text>
          <Text style={styles.sectionText}>Browse match summaries, seasons, leaderboards and player profiles without changing any data.</Text>
          <SecondaryButton label="Continue with View Access" onPress={onViewer} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 18, backgroundColor: colors.bg },
  brand: { alignItems: 'center', gap: 7, marginBottom: 4 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { gap: 14 },
  viewerCard: { gap: 12 },
  sectionHeader: { gap: 5 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sectionText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 7 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.surface2,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  separator: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
});
