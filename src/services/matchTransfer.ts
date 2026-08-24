import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackage, importMatchPackage } from '../data/matchPortability';
import { PortableMatchPackage } from '../types';

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'match';
}

export async function shareMatchSummary(db: SQLiteDatabase, matchId: number) {
  const payload = await exportMatchPackage(db, matchId);
  const fileName = `${safeFilePart(`${payload.match.teamAName}-vs-${payload.match.teamBName}`)}-${payload.match.sourceMatchId}.cricketmatch.json`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));

  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Export match summary',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
}

export async function pickAndImportMatchSummary(db: SQLiteDatabase): Promise<{ matchId: number; title: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const file = new File(result.assets[0]);
  let payload: PortableMatchPackage;
  try {
    payload = JSON.parse(file.textSync()) as PortableMatchPackage;
  } catch {
    throw new Error('This file is not a valid Cricket Scorer match export.');
  }
  return importMatchPackage(db, payload);
}
