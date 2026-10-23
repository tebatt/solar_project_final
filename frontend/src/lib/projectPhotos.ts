const DOCUMENT_PATH = /(?:contract|agreement|document|invoice)/i;
const PHOTO_EXTENSION = /\.(?:jpe?g|png|webp|avif)$/i;
const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp|avif);base64,/i;

export function isSafeProjectPhoto(value?: string | null): value is string {
  if (!value || DOCUMENT_PATH.test(value)) return false;
  if (PHOTO_DATA_URL.test(value)) return true;

  try {
    const url = new URL(value, 'https://utu.invalid');
    return (
      (url.protocol === 'https:' || url.protocol === 'http:')
      && PHOTO_EXTENSION.test(url.pathname)
      && !DOCUMENT_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}
