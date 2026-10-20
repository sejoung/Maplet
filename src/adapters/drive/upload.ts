export function multipartUpload(metadata: object, content: string) {
  const boundary = `maplet-${crypto.randomUUID()}`;
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`,
  };
}
