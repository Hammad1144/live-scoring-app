import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

function pad(value: number) { return String(value).padStart(2, '0'); }
function formatDate(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DatePickerField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseDate(value));

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [cursor]);

  const show = () => {
    setCursor(parseDate(value));
    setOpen(true);
  };

  const moveMonth = (offset: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));
  const choose = (day: number) => {
    onChange(formatDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)));
    setOpen(false);
  };

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <Pressable style={styles.field} onPress={show}>
          <Text style={value ? styles.value : styles.placeholder}>{value || 'Select date'}</Text>
          <Text style={styles.calendar}>▦</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modal}>
            <View style={styles.header}>
              <Pressable style={styles.nav} onPress={() => moveMonth(-1)}><Text style={styles.navText}>‹</Text></Pressable>
              <Text style={styles.month}>{monthNames[cursor.getMonth()]} {cursor.getFullYear()}</Text>
              <Pressable style={styles.nav} onPress={() => moveMonth(1)}><Text style={styles.navText}>›</Text></Pressable>
            </View>

            <View style={styles.weekRow}>{weekDays.map((d, i) => <Text key={`${d}-${i}`} style={styles.weekDay}>{d}</Text>)}</View>
            <View style={styles.days}>
              {days.map((day, index) => {
                if (day == null) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const candidate = formatDate(new Date(cursor.getFullYear(), cursor.getMonth(), day));
                const selected = candidate === value;
                return (
                  <Pressable key={candidate} style={[styles.dayCell, selected && styles.selectedDay]} onPress={() => choose(day)}>
                    <Text style={[styles.dayText, selected && styles.selectedDayText]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.today} onPress={() => { const today = new Date(); onChange(formatDate(today)); setOpen(false); }}>
              <Text style={styles.todayText}>Today</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, gap: 7 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  field: { minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: colors.text, fontSize: 15, fontWeight: '700' },
  placeholder: { color: colors.muted, fontSize: 15 },
  calendar: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 390, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  nav: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  navText: { color: colors.primary, fontSize: 30, lineHeight: 32 },
  month: { color: colors.text, fontWeight: '900', fontSize: 17 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { width: '14.285%', textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '900' },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  selectedDay: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontWeight: '700' },
  selectedDayText: { color: colors.bg, fontWeight: '900' },
  today: { alignSelf: 'center', marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface2 },
  todayText: { color: colors.primary, fontWeight: '900' },
});
