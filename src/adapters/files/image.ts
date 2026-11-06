import { AppError } from '../../domain/errors';

// Stay within common browser canvas limits for very large maps.
const MAX_SIDE = 16_384;
const MAX_PIXELS = 64_000_000;

export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(
    2,
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new AppError('file.couldNotCreateImage'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
