import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createSeason, deleteSeason, getSeasons } from '../data/v14Core';
import { Season } from '../types';
import { Card, Empty, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { DatePickerField } from '../components/DatePickerField';
import { colors } from '../theme';

export function SeasonsScreen({
  onBack,
  onOpen,
  readOnly = false,
}: {
  onBack: () => void;
  onOpen: (id: number) => void;
  readOnly?: boolean;
}) {
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

  const remove = (season: Season) => Alert.alert(
    'Delete season?',
    `${season.name} has no matches and can be safely deleted. Any empty rounds / weeks inside it will also be removed.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deleteSeason(db, season.id); await load(); }
          catch (e) { Alert.alert('Unable to delete season', e instanceof Error ? e.message : String(e)); }
        },
      },
    ],
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Seasons"
        subtitle={readOnly ? 'Browse rounds / weeks, matches and player rankings' : 'Season → Rounds / Weeks → Matches'}
        onBack={onBack}
      />

      {!readOnly ? (
        <Card style={styles.form}>
          <Text style={styles.section}>Add Season</Text>
          <Text style={styles.helper}>Create the overall 7–10 week competition first. Open the season afterward to add Week 1, Week 2, Finals, Tournament A, or any other match grouping.</Text>
          <Field label="SEASON NAME" value={name} onChangeText={setName} placeholder="e.g. Winter League 2026" />
          <View style={styles.dateRow}>
            <DatePickerField label="START DATE" value={startDate} onChange={setStartDate} />
            <DatePickerField label="END DATE" value={endDate} onChange={setEndDate} />
          </View>
          <PrimaryButton label="+ Add Season" onPress={add} />
        </Card>
      ) : null}

      <Text style={styles.section}>Available Seasons</Text>
      {seasons.length === 0 ? (
        <Empty text={readOnly ? 'No seasons are available yet.' : 'No seasons yet. Add your first season above.'} />
      ) : seasons.map(s => (
        <Card key={s.id} style={styles.seasonCard}>
          <Pressable style={styles.openArea} onPress={() => onOpen(s.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.meta}>{s.startDate ?? '—'} → {s.endDate ?? '—'}</Text>
              <Text style={styles.openHint}>Open rounds / weeks & rankings ›</Text>
            </View>
            <View style={styles.count}><Text style={styles.countValue}>{s.matchCount}</Text><Text style={styles.countLabel}>matches</Text></View>
          </Pressable>
          {!readOnly && s.matchCount === 0 ? (
            <Pressable style={styles.deleteButton} onPress={() => remove(s)}>
              <Text style={styles.deleteText}>Delete Season</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 14, paddingBottom: 50 },
  form: { gap: 14 },
  section: { color: colors.text, fontSize: 18, fontWeight: '900' },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  dateRow: { flexDirection: 'row', gap: 10 },
  seasonCard: { marginBottom: 10, padding: 0, overflow: 'hidden' },
  openArea: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  openHint: { color: colors.primary, fontSize: 10, fontWeight: '800', marginTop: 8 },
  count: { alignItems: 'center', minWidth: 62 },
  countValue: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  countLabel: { color: colors.muted, fontSize: 10 },
  deleteButton: { borderTopWidth: 1, borderColor: colors.border, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontWeight: '900', fontSize: 12 },
});
