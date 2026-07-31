// Server-side upload validation for KYC/payment-proof documents. The
// browser-supplied Content-Type is never trusted — a renamed executable or
// mislabeled file would sail through a MIME-string check, so the actual
// file bytes are checked against known magic-byte signatures instead.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const UPLOAD_REJECT_MESSAGE = 'Only PDF, JPG, or PNG files under 5MB are accepted'

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false
  return signature.every((byte, i) => buffer[i] === byte)
}

function hasKnownFileSignature(buffer: Buffer): boolean {
  const isPdf  = matchesSignature(buffer, [0x25, 0x50, 0x44, 0x46]) // %PDF
  const isJpeg = matchesSignature(buffer, [0xff, 0xd8, 0xff])
  const isPng  = matchesSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return isPdf || isJpeg || isPng
}

export function isAllowedUpload(buffer: Buffer, size: number): boolean {
  if (size > MAX_UPLOAD_BYTES) return false
  return hasKnownFileSignature(buffer)
}
