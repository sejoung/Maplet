import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createMap,
  addNode,
  renameNode,
  deleteNode,
  moveNode,
  updateNode,
} from '../domain/commands';
import type { MindMap, MindNode } from '../domain/model';
import { setNodePositions, resetNodePositions } from '../domain/positions';
import { commit, createHistory, undo, redo } from '../application/history';
import { parseMup, serializeMup } from '../adapters/mup/codec';
import { DraftStore, type Draft } from '../adapters/storage/drafts';
import { downloadFile, readMapFile } from '../adapters/storage/files';
import { Editor } from '../components/Editor';
import { Dialog } from '../components/Dialog';
import { ShortcutHelpDialog } from '../components/ShortcutHelpDialog';
import { useDrive } from './useDrive';
import { DriveDialogs } from './DriveDialogs';

const drafts = new DraftStore();
const initial = createMap('중심 주제');

export function App() {
  const [history, setHistory] = useState(() => createHistory(initial));
  const map = history.present;
  const content = useMemo(() => serializeMup(map), [map]);
  const [savedContent, setSavedContent] = useState(content);
  const [filename, setFilename] = useState('제목 없음.mup');
  const [selected, setSelected] = useState(map.roots[0]);
  const [documentKey, setDocumentKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState('이 기기에만 보관');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recovery, setRecovery] = useState<Draft | null>(null);
  const [dialog, setDialog] = useState<'new' | 'help' | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const hasWork = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const importGeneration = useRef(0);
  const dirty = content !== savedContent;
  const selectedId = map.nodes[selected] ? selected : map.roots[0];
  const report = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : '작업을 완료하지 못했습니다.');

  useEffect(() => {
    let active = true;
    drafts
      .load()
      .then((draft) => {
        if (active && draft && draft.content !== draft.savedContent) setRecovery(draft);
      })
      .catch((reason) => {
        if (active) report(reason);
      })
      .finally(() => {
        if (active) setRecoveryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!recoveryReady || recovery || !hasWork.current) return;
    let active = true;
    setDraftStatus('초안 저장 중…');
    const timer = window.setTimeout(() => {
      const draft = {
        content,
        original: map.original,
        filename,
        savedContent,
        updatedAt: Date.now(),
      };
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => drafts.save(draft));
      saveQueue.current
        .then(() => {
          if (active) setDraftStatus('브라우저에 초안 저장됨');
        })
        .catch(() => {
          if (active) {
            setDraftStatus('초안 저장 실패');
            setError('브라우저에 초안을 저장하지 못했습니다. 파일을 다운로드해 주세요.');
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [content, filename, savedContent, map.original, recovery, recoveryReady]);

  useEffect(() => {
    if (!dirty) return;
    const warning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warning);
    return () => window.removeEventListener('beforeunload', warning);
  }, [dirty]);

  const save = useCallback(() => {
    try {
      downloadFile(content, filename);
      setSavedContent(content);
      setNotice('파일 다운로드를 요청했습니다. 다운로드 폴더에서 .mup 파일을 확인해 주세요.');
    } catch (reason) {
      report(reason);
    }
  }, [content, filename]);

  const latestSave = useRef(save);
  useLayoutEffect(() => {
    latestSave.current = save;
  }, [save]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const input = (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable=true]',
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if ((event.target as HTMLElement).matches('[data-inline-editor]')) {
          (event.target as HTMLElement).blur();
          requestAnimationFrame(() => {
            if (!document.querySelector('[data-inline-editor]')) latestSave.current();
          });
        } else save();
      }
      if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
        hasWork.current = true;
      }
      if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory(redo);
        hasWork.current = true;
      }
      if (!input && event.key === '?') setDialog('help');
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [save]);

  const edit = (action: (current: MindMap) => MindMap) => {
    try {
      const next = action(map);
      hasWork.current = true;
      setHistory((current) => commit(current, next));
      setError(null);
      return true;
    } catch (reason) {
      report(reason);
      return false;
    }
  };

  const replace = (next: MindMap, name: string, lastSaved?: string) => {
    hasWork.current = true;
    setEditingId(null);
    setHistory(createHistory(next));
    setSelected(next.roots[0]);
    setFilename(name);
    setSavedContent(lastSaved ?? serializeMup(next));
    setDocumentKey((key) => key + 1);
    setError(null);
    setNotice(next.warnings.length ? next.warnings.join(' ') : null);
  };
  const allowReplace = () =>
    !dirty ||
    window.confirm(
      '아직 파일로 내려받지 않은 변경이 있습니다. 현재 맵을 바꿀까요? 취소 후 .mup 저장으로 보관할 수 있습니다.',
    );
  const open = async (file: File) => {
    const generation = ++importGeneration.current;
    try {
      const next = parseMup(await readMapFile(file));
      if (generation !== importGeneration.current || !allowReplace()) return;
      replace(next, file.name);
      driveState.clearFile();
    } catch (reason) {
      if (generation === importGeneration.current) report(reason);
    }
  };
  const select = (id: string) => {
    if (!map.nodes[id]) return;
    let parent = map.nodes[id].parentId;
    let next = map;
    while (parent) {
      if (next.nodes[parent].collapsed) next = updateNode(next, parent, { collapsed: false });
      parent = next.nodes[parent].parentId;
    }
    if (next !== map) edit(() => next);
    setSelected(id);
  };
  const editTitle = (id = selectedId) => setEditingId(id);
  const add = (sibling = false) => {
    const id = crypto.randomUUID();
    const node = map.nodes[selectedId];
    try {
      const next = addNode(
        map,
        sibling && node.parentId ? node.parentId : selectedId,
        id,
        '새 노드',
        sibling && node.parentId ? selectedId : undefined,
      );
      edit(() => next);
      setSelected(id);
      editTitle(id);
    } catch (reason) {
      report(reason);
    }
  };
  const remove = () => {
    const node = map.nodes[selectedId];
    if (
      node.children.length &&
      !window.confirm('이 노드와 모든 하위 노드를 삭제할까요? 실행 취소로 복원할 수 있습니다.')
    )
      return;
    const fallback = node.parentId ?? map.roots.find((id) => id !== selectedId);
    try {
      const next = deleteNode(map, selectedId);
      edit(() => next);
      setSelected(fallback!);
    } catch (reason) {
      report(reason);
    }
  };
  const recover = () => {
    if (!recovery) return;
    try {
      const next = parseMup(recovery.content);
      next.original = recovery.original;
      replace(next, recovery.filename, recovery.savedContent);
      setRecovery(null);
      setNotice('이 기기의 초안을 복구했습니다. 파일로 다운로드해 보관하세요.');
    } catch (reason) {
      report(reason);
    }
  };
  const discardRecovery = async () => {
    try {
      await drafts.clear();
      setRecovery(null);
    } catch (reason) {
      report(reason);
    }
  };

  const driveState = useDrive({ content, filename, allowReplace, replace, report, setNotice });
  const closeDialog = useCallback(() => setDialog(null), []);
  const preventRecoveryClose = useCallback(() => {}, []);

  return (
    <>
      <Editor
        map={map}
        selected={selectedId}
        filename={filename}
        dirty={dirty}
        draftStatus={draftStatus}
        error={error}
        notice={notice}
        documentKey={documentKey}
        editingId={editingId}
        onCancelEdit={() => setEditingId(null)}
        onSelect={select}
        onEdit={editTitle}
        onAdd={add}
        onDelete={remove}
        onToggle={(id) =>
          edit((current) => updateNode(current, id, { collapsed: !current.nodes[id].collapsed }))
        }
        onRename={(id, title) => {
          const saved = edit((current) => renameNode(current, id, title));
          if (saved) setEditingId(null);
          return saved;
        }}
        onUpdate={(
          id,
          patch: Partial<Pick<MindNode, 'notes' | 'links' | 'style' | 'side' | 'collapsed'>>,
        ) => edit((current) => updateNode(current, id, patch))}
        onMove={(id, parent) => edit((current) => moveNode(current, id, parent))}
        onReposition={(positions) => edit((current) => setNodePositions(current, positions))}
        onAutoLayout={() => edit((current) => resetNodePositions(current))}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onNew={() => {
          setNewTitle('');
          setDialog('new');
        }}
        onOpen={(file) => void open(file)}
        onSave={save}
        onBackup={() => {
          if (map.original)
            downloadFile(map.original, filename.replace(/\.mup$/i, '') + '.original.mup');
        }}
        onHelp={() => setDialog('help')}
        onDrive={driveState.showDrive}
        onDismissError={() => setError(null)}
        onDismissNotice={() => setNotice(null)}
      />
      {recovery && (
        <Dialog title="초안 복구" onClose={preventRecoveryClose}>
          <p>
            이 기기에 저장된 <strong>{recovery.filename}</strong> 초안이 있습니다.
          </p>
          <p className="muted">
            {new Date(recovery.updatedAt).toLocaleString('ko-KR')} · 아직 파일로 저장하지 않은 변경
          </p>
          <div className="dialog-actions">
            <button className="button quiet" onClick={() => void discardRecovery()}>
              초안 삭제
            </button>
            <button className="button primary" onClick={recover}>
              초안 복구
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'new' && (
        <Dialog title="새 맵" onClose={closeDialog}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (allowReplace()) {
                const next = createMap(newTitle.trim());
                replace(next, `${newTitle.trim().slice(0, 80)}.mup`, '');
                driveState.clearFile();
                setDialog(null);
              }
            }}
          >
            <label htmlFor="new-title">중심 주제</label>
            <input
              id="new-title"
              data-autofocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="중심 주제"
              required
              maxLength={10000}
            />
            <div className="dialog-actions">
              <button className="button quiet" type="button" onClick={closeDialog}>
                취소
              </button>
              <button className="button primary" type="submit">
                만들기
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === 'help' && <ShortcutHelpDialog onClose={closeDialog} />}
      <DriveDialogs controller={driveState} save={save} />
    </>
  );
}
