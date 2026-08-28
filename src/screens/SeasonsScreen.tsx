import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createSeason, getSeasons } from '../data/v14Core';
import { Season } from '../types';
import { Card, Empty, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function SeasonsScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (id: number) => void }) {
  const db = useSQLiteContext();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = () => getSeasons(db).then(setSeasons);
  useEffect(() => { load(); }, [db]);

  const add = async () => {
    try {
      const id = await createSeason(db, name, startDate, endDate);
      setName('');
      setStartDate('');
      setEndDate('');
      await load();
      onOpen(id);
    } catch (e) {
      Alert.alert('Unable to create season', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Seasons" subtitle="Group matches across multi-week competitions" onBack={onBack} />
      <Card style={styles.form}>
        <Text style={styles.section}>Add Season</Text>
        <Field label="SEASON NAME" value={name} onChangeText={setName} placeholder="e.g. Winter League 2026" />
        <View style={styles.dateRow}>
          <View style={styles.dateField}><Field label="START DATE" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" /></View>
          <View style={styles.dateField}><Field label="END DATE" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" /></View>
        </View>
        <PrimaryButton label="+ Add Season" onPress={add} />
      </Card>

      <Text style={styles.section}>Available Seasons</Text>
      {seasons.length === 0 ? <Empty text="No seasons yet. Add your first season above." /> : seasons.map(s => (
        <Pressable key={s.id} onPress={() => onOpen(s.id)}>
          <Card style={styles.seasonCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.meta}>{s.startDate ?? '—'} → {s.endDate ?? '—'}</Text>
            </View>
            <View style={styles.count}><Text style={styles.countValue}>{s.matchCount}</Text><Text style={styles.countLabel}>matches</Text></View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 14, paddingBottom: 50 },
  form: { gap: 14 },
  section: { color: colors.text, fontSize: 18, fontWeight: '900' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  seasonCard: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  count: { alignItems: 'center', minWidth: 62 },
  countValue: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  countLabel: { color: colors.muted, fontSize: 10 },
});
