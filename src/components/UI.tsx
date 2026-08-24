import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : null}
      <View style={styles.headerCenter}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, danger && styles.dangerButton, disabled && styles.disabled, pressed && !disabled && { opacity: 0.8 }]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, disabled && styles.disabled, pressed && !disabled && { opacity: 0.8 }]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} />
    </View>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled || !onPress} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled]}>
      <Text style={[styles.chipText, selected && styles.chipSelectedText]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 54, justifyContent: 'center', marginBottom: 18, position: 'relative' },
  headerCenter: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 54 },
  back: { position: 'absolute', left: 0, top: 7, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 32, lineHeight: 34, marginTop: -4 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.muted, marginTop: 3, lineHeight: 18, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16 },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: '#052015', fontWeight: '800', fontSize: 15 },
  secondaryButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2, paddingHorizontal: 14, fontSize: 15 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, minHeight: 38, paddingHorizontal: 13, borderRadius: 999, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  chipSelectedText: { color: '#052015' },
  empty: { paddingVertical: 36, alignItems: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center' },
});
