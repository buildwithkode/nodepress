/**
 * Multer (busboy) reads a multipart file name as Latin-1, so a UTF-8 name such
 * as "Café.png" or a Mac screenshot ("… at 2.38.15 PM.png", which has a narrow
 * no-break space before PM) arrives garbled ("CafÃ©.png", "2.38.15â¯PM").
 * Re-reads the bytes as UTF-8; names that aren't valid UTF-8 stay as they are.
 */
export function uploadName(name: string): string {
  if (!name || /[^\x00-\xff]/.test(name) || !/[\x80-\xff]/.test(name)) return name;
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}
