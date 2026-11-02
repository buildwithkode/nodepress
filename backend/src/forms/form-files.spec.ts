import { attachUploads, contentDisposition } from './form-files';
import { validateSubmission } from './submission-validator';
import { FormField } from './types/form-field.types';

const PDF = Buffer.from('%PDF-1.7 test');
const MAX = 1024;
const resume: FormField = { name: 'resume', label: 'Resume', type: 'file' } as FormField;

const upload = (overrides: Partial<Express.Multer.File> = {}) =>
  ({ fieldname: 'resume', originalname: 'cv.pdf', buffer: PDF, size: PDF.length, ...overrides }) as Express.Multer.File;

const errorsOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e: any) {
    return e.getResponse().errors.map((x: { rule: string }) => x.rule);
  }
  throw new Error('expected a validation error');
};

describe('attachUploads', () => {
  it('stores a valid file and describes it in the values', () => {
    const { values, files } = attachUploads([resume], { name: 'A' }, [upload()], MAX);
    expect(files).toHaveLength(1);
    expect(values.resume).toEqual({
      fileId: files[0].id,
      filename: 'cv.pdf',
      mimetype: 'application/pdf',
      size: PDF.length,
    });
    expect(values.name).toBe('A');
    expect(Buffer.from(files[0].data).equals(PDF)).toBe(true);
  });

  it('throws away a value the client sent under a file field', () => {
    const forged = { fileId: 'someone-elses', filename: 'x.pdf' };
    const { values, files } = attachUploads([resume], { resume: forged }, [], MAX);
    expect(values.resume).toBeUndefined();
    expect(files).toHaveLength(0);
  });

  it('refuses a file whose bytes do not match its extension', () => {
    const fake = upload({ buffer: Buffer.from('<script>alert(1)</script>') });
    expect(errorsOf(() => attachUploads([resume], {}, [fake], MAX))).toEqual(['fileType']);
  });

  it('refuses an extension the field does not allow', () => {
    const png = upload({ originalname: 'cv.png' });
    expect(errorsOf(() => attachUploads([resume], {}, [png], MAX))).toEqual(['fileType']);
  });

  it('uses the extensions the field lists', () => {
    const field = { ...resume, options: ['.PNG'] } as FormField;
    const png = upload({ originalname: 'a.png', buffer: Buffer.from('89504e470d0a1a0a00', 'hex') });
    expect(attachUploads([field], {}, [png], MAX).files[0].mimetype).toBe('image/png');
    expect(errorsOf(() => attachUploads([field], {}, [upload()], MAX))).toEqual(['fileType']);
  });

  it('refuses a second file, an unknown field and an oversized file', () => {
    expect(errorsOf(() => attachUploads([resume], {}, [upload(), upload()], MAX))).toEqual(['file']);
    expect(errorsOf(() => attachUploads([resume], {}, [upload({ fieldname: 'other' })], MAX))).toEqual(['file']);
    expect(errorsOf(() => attachUploads([resume], {}, [upload({ size: MAX + 1 })], MAX))).toEqual(['fileSize']);
  });

  it('drops any path from the file name', () => {
    const { files } = attachUploads([resume], {}, [upload({ originalname: '../../etc/cv.pdf' })], MAX);
    expect(files[0].filename).toBe('cv.pdf');
  });
});

describe('file fields in validateSubmission', () => {
  const limits = { maxDepth: 5, maxArrayLength: 10, maxFields: 50, maxPayloadBytes: 10000 } as any;

  it('reports a required file that is missing', () => {
    const field = { ...resume, validation: { required: true } } as FormField;
    expect(errorsOf(() => validateSubmission([field], {}, limits))).toEqual(['required']);
  });

  it('refuses a value for a file field inside a group', () => {
    const group = { name: 'g', type: 'group', fields: [resume] } as FormField;
    expect(errorsOf(() => validateSubmission([group], { g: { resume: { fileId: 'x' } } }, limits))).toEqual(['file']);
  });
});

describe('contentDisposition', () => {
  it('always marks an attachment and escapes the name', () => {
    const header = contentDisposition('my "cv" é.pdf');
    expect(header.startsWith('attachment; filename="my _cv_ _.pdf"')).toBe(true);
    expect(header).toContain("filename*=UTF-8''my%20%22cv%22%20%C3%A9.pdf");
  });
});
