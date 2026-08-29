import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { reopenMatchForEditing } from '../data/v13Core';
import { getMatchDetailV16 as getMatchDetail } from '../data/v16Core';
import { economy, formatOvers, strikeRate } from '../logic/cricket';
import { MatchDetail } from '../types';
import { Card, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function MatchDetailScreen({
  matchId,
  onBack,
  onEdit,
  readOnly = false,
}: {
  matchId: number;
  onBack: () => void;
  onEdit?: () => void;
  readOnly?: boolean;
}) {
  const db = useSQLiteContext();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  useEffect(() => { getMatchDetail(db, matchId).then(setDetail); }, [db, matchId]);

  const editMatch = () => Alert.alert(
    'Edit completed match?',
    'The match will be reopened. You can undo the last ball, continue undoing earlier balls, and then record the corrected scoring. The match will remain in progress until it completes again.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit Scoring',
        onPress: async () => {
          try {
            await reopenMatchForEditing(db, matchId);
            onEdit?.();
          } catch (e) {
            Alert.alert('Unable to edit match', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ],
  );

  if (!detail) return null;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title={detail.title}
        subtitle={`${detail.oversLimit} overs • ${new Date(detail.createdAt).toLocaleDateString()}${readOnly ? ' • View only' : ''}`}
        onBack={onBack}
      />
      {detail.resultText ? <Card style={styles.resultCard}><Text style={styles.result}>{detail.resultText}</Text></Card> : null}
      {!readOnly && detail.status === 'COMPLETE' ? <PrimaryButton label="Edit Scoring / Undo Balls" onPress={editMatch} /> : null}
      {detail.innings.map(inn => <View key={inn.inningsId} style={{ gap: 10 }}>
        <View style={styles.inningsHeader}><Text style={styles.team}>{inn.teamName}</Text><Text style={styles.total}>{inn.runs}/{inn.wickets} <Text style={styles.overs}>({formatOvers(inn.legalBalls)})</Text></Text></View>
        <Card>
          <Text style={styles.tableTitle}>Batting</Text>
          <View style={styles.tableHeader}><Text style={[styles.th, { flex: 1.8 }]}>Batter</Text><Text style={styles.th}>R</Text><Text style={styles.th}>B</Text><Text style={styles.th}>4</Text><Text style={styles.th}>6</Text><Text style={styles.th}>SR</Text></View>
          {inn.batters.map(b => <View key={b.playerId} style={styles.tableRow}><View style={{ flex: 1.8 }}><Text style={styles.name}>{b.name}</Text><Text style={styles.dismissal}>{b.dismissal}</Text></View><Text style={styles.td}>{b.runs}</Text><Text style={styles.td}>{b.balls}</Text><Text style={styles.td}>{b.fours}</Text><Text style={styles.td}>{b.sixes}</Text><Text style={styles.td}>{strikeRate(b.runs, b.balls).toFixed(0)}</Text></View>)}
          <Text style={styles.extras}>Extras: {inn.wides + inn.noBalls + inn.byes + inn.legByes} (Wd {inn.wides}, Nb {inn.noBalls}, B {inn.byes}, Lb {inn.legByes})</Text>
        </Card>
        <Card>
          <Text style={styles.tableTitle}>Bowling</Text>
          <View style={styles.tableHeader}><Text style={[styles.th, { flex: 1.8 }]}>Bowler</Text><Text style={styles.th}>O</Text><Text style={styles.th}>R</Text><Text style={styles.th}>W</Text><Text style={styles.th}>Econ</Text></View>
          {inn.bowlers.map(b => <View key={b.playerId} style={styles.tableRow}><Text style={[styles.name, { flex: 1.8 }]}>{b.name}</Text><Text style={styles.td}>{formatOvers(b.legalBalls)}</Text><Text style={styles.td}>{b.runs}</Text><Text style={styles.td}>{b.wickets}</Text><Text style={styles.td}>{economy(b.runs, b.legalBalls).toFixed(2)}</Text></View>)}
        </Card>
        <Card>
          <Text style={styles.tableTitle}>Over-by-over</Text>
          {inn.overs.length === 0 ? <Text style={styles.dismissal}>No deliveries.</Text> : inn.overs.map(o => <View key={o.overNo} style={styles.overRow}><Text style={styles.overNo}>Over {o.overNo}</Text><Text style={styles.overBalls}>{o.balls.join('  ')}</Text></View>)}
        </Card>
      </View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, gap: 14, paddingBottom: 50 },
  resultCard: { backgroundColor: '#0e2b1f' },
  result: { color: colors.primary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  inningsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  team: { color: colors.text, fontWeight: '900', fontSize: 20 },
  total: { color: colors.primary, fontWeight: '900', fontSize: 20 },
  overs: { color: colors.muted, fontSize: 13 },
  tableTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 7 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#173428', paddingVertical: 9 },
  th: { flex: 0.7, color: colors.muted, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  td: { flex: 0.7, color: colors.text, fontSize: 12, textAlign: 'right', fontWeight: '700' },
  name: { color: colors.text, fontWeight: '800', fontSize: 12 },
  dismissal: { color: colors.muted, fontSize: 10, marginTop: 2 },
  extras: { color: colors.muted, fontSize: 11, marginTop: 12 },
  overRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#173428' },
  overNo: { color: colors.primary, fontWeight: '800', width: 62, fontSize: 11 },
  overBalls: { color: colors.text, flex: 1, fontWeight: '700', fontSize: 12 },
});
