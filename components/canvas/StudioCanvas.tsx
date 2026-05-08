'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tldraw,
  type Editor,
  type StoreSnapshot,
  type TLRecord,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { saveStorySnapshotAction } from '@/app/actions/save-story-snapshot';

const AUTOSAVE_DEBOUNCE_MS = 5_000;

interface StudioCanvasProps {
  storyId: string;
  /** 서버에서 로드한 직전 snapshot JSON. 없으면 빈 캔버스. */
  initialSnapshotJson: string | null;
  /** 채널 소유자만 편집 가능. 방문자에겐 readonly 모드. */
  canEdit: boolean;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function StudioCanvas({ storyId, initialSnapshotJson, canEdit }: StudioCanvasProps) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 페이지 이탈 시 미저장 변경분 즉시 flush
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // beacon 형태로 보낼 수 없는 server action 이라 cleanup 시점엔 포기.
        // Phase 4 Yjs 도입 시 IndexedDB 백업으로 보강 예정.
      }
    };
  }, []);

  const flushSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setStatus('saving');
    setErrorMsg(null);
    try {
      const snapshot = editor.store.getStoreSnapshot();
      const json = JSON.stringify(snapshot);
      const result = await saveStorySnapshotAction(storyId, json);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error ?? 'unknown');
        return;
      }
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.error('[StudioCanvas] save 실패:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown');
    }
  }, [storyId]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // 초기 snapshot 로드
      if (initialSnapshotJson) {
        try {
          const parsed = JSON.parse(initialSnapshotJson) as StoreSnapshot<TLRecord>;
          editor.store.loadStoreSnapshot(parsed);
        } catch (err) {
          console.warn('[StudioCanvas] 초기 snapshot 파싱 실패, 빈 캔버스로 시작:', err);
        }
      }

      // 읽기 전용 모드 (방문자)
      if (!canEdit) {
        editor.updateInstanceState({ isReadonly: true });
        return;
      }

      // 변경 감지 → 5초 debounce → 자동 저장
      const unsubscribe = editor.store.listen(
        () => {
          setStatus('pending');
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
        },
        { source: 'user', scope: 'document' },
      );

      // editor 인스턴스 dispose 시 자동 호출되지만, 명시적으로도 등록
      return unsubscribe;
    },
    [initialSnapshotJson, canEdit, flushSave],
  );

  return (
    <div className="relative h-full w-full">
      <Tldraw onMount={handleMount} />
      {canEdit && <SaveIndicator status={status} errorMsg={errorMsg} onRetry={flushSave} />}
      {!canEdit && <ReadOnlyBadge />}
    </div>
  );
}

function SaveIndicator({
  status,
  errorMsg,
  onRetry,
}: {
  status: SaveStatus;
  errorMsg: string | null;
  onRetry: () => void;
}) {
  const label =
    status === 'saving' ? '저장 중…'
    : status === 'pending' ? '편집 중 (5초 후 저장)'
    : status === 'saved' ? '저장됨'
    : status === 'error' ? `오류: ${errorMsg ?? ''}`
    : null;

  if (!label) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-50 flex items-center gap-2">
      <div
        className={
          status === 'error'
            ? 'rounded-sm border border-rec/40 bg-rec/10 px-3 py-1 text-xs text-rec'
            : status === 'saved'
              ? 'rounded-sm border border-live/40 bg-live/10 px-3 py-1 text-xs text-live'
              : 'rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm'
        }
      >
        {label}
      </div>
      {status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="pointer-events-auto rounded-sm border border-rec/40 bg-rec px-2 py-1 text-xs font-medium text-fg hover:brightness-110"
        >
          재시도
        </button>
      )}
    </div>
  );
}

function ReadOnlyBadge() {
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-50 rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm">
      읽기 전용 (방문자 모드)
    </div>
  );
}
