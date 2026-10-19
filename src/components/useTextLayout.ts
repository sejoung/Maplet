import { useEffect, useMemo, useState } from 'react';
import type { MindMap } from '../domain/model';
import { layoutMap } from '../engine/layout';
import { clearTextMeasurements, measureNodeText } from './text-measure';

export function useTextLayout(map: MindMap) {
  const [measureText, setMeasureText] = useState(() => measureNodeText);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      clearTextMeasurements();
      const refreshed: typeof measureNodeText = (text, node) => measureNodeText(text, node);
      setMeasureText(() => refreshed);
    };
    void document.fonts?.ready.then(refresh);
    document.fonts?.addEventListener('loadingdone', refresh);
    return () => {
      active = false;
      document.fonts?.removeEventListener('loadingdone', refresh);
    };
  }, []);
  return useMemo(() => layoutMap(map, measureText), [map, measureText]);
}
