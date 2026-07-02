import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button, Chip, Eyebrow, GearButton, ConsoleProgress } from '../components';
import { useStore, activeBoard } from '../store/useStore';
import { ImportReport } from '../store/types';

const UPLOAD_LINES = [
  'POST /api/qwk/reply',
  'uploading REP packet ...',
  'server parsing packet ...',
  'posting messages ...',
  'import complete.',
];

function ReportCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.cell}>
      <Mono size={fontSize.statMed} weight="bold" color={color}>
        {value}
      </Mono>
      <Vga size={fontSize.eyebrow} color={colors.textMuted} spacing={letterSpacing.label} style={styles.cellLabel}>
        {label}
      </Vga>
    </View>
  );
}

export function OutboxScreen() {
  const drafts = useStore((s) => s.drafts);
  const uploading = useStore((s) => s.uploading);
  const report = useStore((s) => s.report);
  const uploadRep = useStore((s) => s.uploadRep);
  const clearReport = useStore((s) => s.clearReport);
  const removeDraft = useStore((s) => s.removeDraft);
  const error = useStore((s) => s.error);
  const board = useStore(activeBoard);

  return (
    <Screen title="OUTBOX" right={<GearButton />} scroll>
      {uploading ? (
        <ConsoleProgress lines={UPLOAD_LINES} showBar accent={colors.green} />
      ) : report ? (
        <ImportReportView report={report} bbsId={board?.bbsId ?? ''} onDone={clearReport} />
      ) : drafts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="file-tray-outline" size={48} color={colors.textDim} />
          <Vga size={fontSize.body} color={colors.textMuted} style={styles.emptyText}>
            Outbox is empty
          </Vga>
          <Mono size={fontSize.listMeta} color={colors.textDim} style={styles.emptyHint}>
            Replies you save appear here, ready to upload.
          </Mono>
        </View>
      ) : (
        <>
          <Eyebrow>PENDING REPLIES · {drafts.length}</Eyebrow>
          <Card style={styles.list}>
            {drafts.map((d, i) => (
              <View key={d.id} style={[styles.draft, i < drafts.length - 1 && styles.draftDivider]}>
                <View style={styles.draftHead}>
                  <Mono size={fontSize.listPrimary} weight="semibold" color={colors.textPrimary} style={styles.draftSubj} numberOfLines={1}>
                    {d.subject}
                  </Mono>
                  <Chip label="PENDING" color={colors.amber} />
                </View>
                <Mono size={fontSize.listMeta} color={colors.textMuted}>
                  to {d.to} · {d.areaName}
                  {d.priv ? ' · private' : ''}
                </Mono>
                <Mono size={fontSize.listMeta} color={colors.textDim} numberOfLines={1} style={styles.draftPreview}>
                  {d.body.replace(/\n/g, ' ')}
                </Mono>
                <Mono size={fontSize.listMeta} color={colors.redSoft} onPress={() => removeDraft(d.id)} style={styles.discard}>
                  discard
                </Mono>
              </View>
            ))}
          </Card>
          {error && (
            <Card style={styles.error}>
              <Mono size={fontSize.listMeta} color={colors.red}>
                ✗ {error}
              </Mono>
              <Mono size={fontSize.listMeta} color={colors.textDim} style={styles.errorHint}>
                Replies are kept — uploading is idempotent, so it's safe to retry.
              </Mono>
            </Card>
          )}
          <Button title="⟰ UPLOAD REP PACKET" variant="green" onPress={uploadRep} style={styles.upload} />
        </>
      )}
    </Screen>
  );
}

function ImportReportView({ report, bbsId, onDone }: { report: ImportReport; bbsId: string; onDone: () => void }) {
  return (
    <>
      <Card style={styles.reportHead}>
        <Ionicons name="checkmark-circle" size={22} color={colors.green} />
        <View style={styles.reportHeadText}>
          <Mono size={fontSize.body} weight="bold" color={colors.green}>
            REP accepted
          </Mono>
          <Mono size={fontSize.listMeta} color={colors.textMuted}>
            {bbsId}.REP imported by the BBS
          </Mono>
        </View>
      </Card>
      <View style={styles.grid}>
        <ReportCell label="POSTED" value={report.posted} color={colors.green} />
        <ReportCell label="THREADS LINKED" value={report.linked} color={colors.cyan} />
        <ReportCell label="DUPLICATES" value={report.dup} color={colors.amber} />
        <ReportCell label="SKIPPED" value={report.skipped} color={colors.red} />
      </View>
      <Button title="DONE" variant="secondary" onPress={onDone} style={styles.done} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  draft: { padding: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.amber, gap: 3 },
  draftDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderDivider },
  draftHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftSubj: { flex: 1, marginRight: spacing.sm },
  draftPreview: { marginTop: 1 },
  discard: { marginTop: 4 },
  upload: { marginTop: spacing.lg },
  error: { marginTop: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.red },
  errorHint: { marginTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyText: {},
  emptyHint: {},
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceConsole },
  reportHeadText: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  cell: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  cellLabel: { marginTop: 4 },
  done: { marginTop: spacing.lg },
});
