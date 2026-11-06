import type { MindMap } from '../domain/model';
import { stripMapExtension } from '../domain/filename';
import { layoutMap } from '../engine/layout';
import type { TextMeasurer } from '../engine/node-measure';
import { renderSvg } from '../engine/svg-export';
import { exportMap } from '../adapters/formats';
import { downloadBlob, downloadFile, downloadText } from '../adapters/storage/files';
import { svgToPng } from '../adapters/storage/image';
import { printSvg } from '../adapters/storage/print';
import type { Translatable } from '../i18n/core';

/** Copies of the open map in other formats: MindMup, images, outlines and print. */
export function useExports(
  map: MindMap,
  filename: string,
  {
    report,
    setNotice,
    measure,
  }: {
    report(reason: unknown): void;
    setNotice(notice: Translatable): void;
    /** Measures node text for image layout; the app passes the DOM measurer. */
    measure: TextMeasurer;
  },
) {
  const base = stripMapExtension(filename);
  const attempt = (action: () => void | Promise<void>) => async () => {
    try {
      await action();
    } catch (reason) {
      report(reason);
    }
  };
  const drawing = () => renderSvg(map, layoutMap(map, measure));
  return {
    onExportMup: attempt(() => {
      downloadText(exportMap(map, 'mup', base));
      setNotice('app.exportedCompatibleMupFileUse');
    }),
    onExportImage: (format: 'png' | 'svg') =>
      void attempt(async () => {
        const image = drawing();
        const blob =
          format === 'svg'
            ? new Blob([image.svg], { type: 'image/svg+xml' })
            : await svgToPng(image.svg, image.width, image.height);
        downloadBlob(blob, `${base}.${format}`);
      })(),
    onExportOutline: (format: 'md' | 'opml') =>
      void attempt(() => downloadText(exportMap(map, format, base)))(),
    onPrint: attempt(() => {
      const image = drawing();
      printSvg(image.svg, image.width, image.height, base);
    }),
    onBackup: () => {
      if (map.original) downloadFile(map.original, `${base}.original.mup`);
    },
  };
}
