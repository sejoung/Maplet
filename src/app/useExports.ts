import type { MindMap } from '../domain/model';
import { stripMapExtension } from '../domain/filename';
import { layoutMap } from '../engine/layout';
import { renderSvg } from '../engine/svg-export';
import { measureNodeText } from '../components/text-measure';
import { serializeMup } from '../adapters/mup/codec';
import { mupFilename } from '../adapters/documents';
import { downloadBlob, downloadFile } from '../adapters/storage/files';
import { svgToPng } from '../adapters/storage/image';
import { printSvg } from '../adapters/storage/print';
import { mapToMarkdown, mapToOpml } from '../adapters/outline/outline';
import type { Translatable } from '../i18n/core';

/** Copies of the open map in other formats: MindMup, images, outlines and print. */
export function useExports(
  map: MindMap,
  filename: string,
  report: (reason: unknown) => void,
  setNotice: (notice: Translatable) => void,
) {
  const base = stripMapExtension(filename);
  const attempt = (action: () => void | Promise<void>) => async () => {
    try {
      await action();
    } catch (reason) {
      report(reason);
    }
  };
  const drawing = () => renderSvg(map, layoutMap(map, measureNodeText));
  return {
    onExportMup: attempt(() => {
      downloadFile(serializeMup(map), mupFilename(filename));
      setNotice('.mup 호환 파일을 내보냈습니다. Maplet 원본은 .maplet 저장으로 보관하세요.');
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
      void attempt(() => {
        const text = format === 'md' ? mapToMarkdown(map) : mapToOpml(map, base);
        const type = format === 'md' ? 'text/markdown' : 'text/x-opml';
        downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), `${base}.${format}`);
      })(),
    onPrint: attempt(() => {
      const image = drawing();
      printSvg(image.svg, image.width, image.height, base);
    }),
    onBackup: () => {
      if (map.original) downloadFile(map.original, `${base}.original.mup`);
    },
  };
}
