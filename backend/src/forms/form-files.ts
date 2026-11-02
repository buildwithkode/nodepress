import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { FormField } from './types/form-field.types';
import { ValidationError } from './submission-validator';

export const MAX_FILES_PER_SUBMISSION = 5;

/** The file kinds a form may take, and how to recognise each from its first bytes. */
const FILE_KINDS: Record<string, { mimetype: string; matches: (b: Buffer) => boolean }> = {
  pdf: { mimetype: 'application/pdf', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  doc: { mimetype: 'application/msword', matches: (b) => b.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1' },
  docx: {
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    matches: (b) => b.subarray(0, 4).toString('hex') === '504b0304',
  },
  jpg: { mimetype: 'image/jpeg', matches: (b) => b.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mimetype: 'image/jpeg', matches: (b) => b.subarray(0, 3).toString('hex') === 'ffd8ff' },
  png: { mimetype: 'image/png', matches: (b) => b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
};

/** Allowed when a file field lists no extensions. */
const DEFAULT_EXTENSIONS = ['pdf', 'doc', 'docx'];

export interface StoredFileValue {
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
}

/** A FormFile row to create. */
export interface NewFormFile {
  id: string;
  field: string;
  filename: string;
  mimetype: string;
  size: number;
  data: Uint8Array<ArrayBuffer>;
}

const label = (field: FormField) => field.label ?? field.name;

/** Multer reads the name as latin1; browsers send UTF-8. Paths and control characters are dropped. */
function cleanFilename(original: string): string {
  const name = Buffer.from(original, 'latin1').toString('utf8');
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'file';
}

/** The field's allowed extensions, limited to the kinds this server can recognise. */
function allowedExtensions(field: FormField): string[] {
  const listed = (field.options ?? []).map((ext) => String(ext).trim().toLowerCase().replace(/^\./, ''));
  const known = listed.filter((ext) => ext in FILE_KINDS);
  return known.length ? known : DEFAULT_EXTENSIONS;
}

/**
 * Checks the uploaded files against the form's `file` fields and returns the
 * values to validate, with each file field set from the bytes received. Anything
 * the client put under a file field's name is thrown away.
 */
export function attachUploads(
  fields: FormField[],
  raw: Record<string, unknown>,
  uploaded: Express.Multer.File[],
  maxBytes: number,
): { values: Record<string, unknown>; files: NewFormFile[] } {
  const values = { ...raw };
  const files: NewFormFile[] = [];
  const errors: ValidationError[] = [];
  const fileFields = fields.filter((field) => field.type === 'file');

  for (const field of fileFields) delete values[field.name];

  for (const upload of uploaded) {
    const path = upload.fieldname;
    const field = fileFields.find((f) => f.name === path);
    const error = (rule: string, message: string) => errors.push({ path, rule, message });

    if (!field) {
      error('file', `This form has no file field named "${path}"`);
      continue;
    }
    if (values[path]) {
      error('file', `"${label(field)}" takes one file`);
      continue;
    }
    const allowed = allowedExtensions(field);
    const extension = extname(cleanFilename(upload.originalname)).slice(1).toLowerCase();
    if (!allowed.includes(extension)) {
      error('fileType', `"${label(field)}" must be one of: ${allowed.join(', ')}`);
      continue;
    }
    // The name and the browser's type are the sender's word; the bytes are not.
    const kind = FILE_KINDS[extension];
    if (!kind.matches(upload.buffer)) {
      error('fileType', `"${label(field)}" isn't a valid ${extension} file`);
      continue;
    }
    if (upload.size > maxBytes) {
      error('fileSize', `"${label(field)}" is too large`);
      continue;
    }

    const id = randomUUID();
    const value: StoredFileValue = {
      fileId: id,
      filename: cleanFilename(upload.originalname),
      mimetype: kind.mimetype,
      size: upload.size,
    };
    values[path] = value;
    files.push({ id, field: path, filename: value.filename, mimetype: value.mimetype, size: value.size, data: new Uint8Array(upload.buffer) });
  }

  if (errors.length) throw new BadRequestException({ message: 'Validation failed', errors });
  return { values, files };
}

/** An attachment header that survives quotes and non-ASCII names in the file name. */
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
