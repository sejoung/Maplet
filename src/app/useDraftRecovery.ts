import { useEffect, useState } from 'react';
import type { Draft, DraftRepository, StoredDraft } from '../adapters/storage/drafts';
import { draftHasChanges } from '../adapters/storage/recovery';
import type { TabSession } from '../adapters/storage/tab-session';

interface Candidate {
  /** Null for this tab's own draft; otherwise the key of a closed tab's draft. */
  key: string | null;
  draft: Draft;
}

/** Drafts of unsaved changes left by this tab or closed tabs, offered one at a time. */
async function candidates(drafts: DraftRepository, tab: TabSession): Promise<Candidate[]> {
  // A tab opened for a new map starts empty; closed tabs' drafts wait for another visit.
  if (tab.newMap !== null) return [];
  const own = await drafts.load();
  const others: StoredDraft[] = await drafts.others(tab.live);
  // Drafts without unsaved changes have nothing left to recover.
  for (const stale of others.filter(({ draft }) => !draftHasChanges(draft)))
    void drafts.remove(stale.key).catch(() => {});
  return [
    ...(own && draftHasChanges(own) ? [{ key: null, draft: own }] : []),
    ...others.filter(({ draft }) => draftHasChanges(draft)),
  ];
}

/** Finds recoverable drafts at startup; `apply` puts a chosen draft into the editor. */
export function useDraftRecovery(
  drafts: DraftRepository,
  tab: TabSession,
  { apply, report }: { apply(draft: Draft): void; report(reason: unknown): void },
) {
  const [loaded, setLoaded] = useState(false);
  // This tab's own draft first, then drafts of closed tabs, newest first.
  const [found, setFound] = useState<Candidate[]>([]);
  useEffect(() => {
    let active = true;
    candidates(drafts, tab)
      .then((list) => {
        if (active) setFound(list);
      })
      .catch((reason) => {
        if (active) report(reason);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [drafts, report, tab]);
  const offered = found[0]?.draft ?? null;
  return {
    /** The draft to offer now, if any. */
    offered,
    /** Loading finished and nothing waits for an answer, so other startup work may begin. */
    settled: loaded && !offered,
    recover: () => {
      const [candidate] = found;
      if (!candidate) return;
      try {
        const { key, draft } = candidate;
        apply(draft);
        // Other closed tabs' drafts stay for a later visit rather than replacing this one.
        setFound([]);
        // Take over a closed tab's draft: keep it in this tab's slot before deleting the old one.
        if (key)
          void drafts
            .save(draft)
            .then(() => drafts.remove(key))
            .catch(report);
      } catch (reason) {
        report(reason);
      }
    },
    discard: async () => {
      const [candidate, ...rest] = found;
      if (!candidate) return;
      try {
        await (candidate.key ? drafts.remove(candidate.key) : drafts.clear());
        setFound(rest);
      } catch (reason) {
        report(reason);
      }
    },
  };
}
