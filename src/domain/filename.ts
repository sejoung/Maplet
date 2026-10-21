const extension = /\.(?:maplet|mup|json)$/i;
const extensions = /(?:\.(?:maplet|mup|json))+$/i;

/** Replace control and path characters that no file system accepts in a name. */
export const sanitizeFilename = (name: string) =>
  [...name]
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_');

export const stripMapExtension = (name: string) => name.replace(extension, '');
export const stripMapExtensions = (name: string) => name.replace(extensions, '');
