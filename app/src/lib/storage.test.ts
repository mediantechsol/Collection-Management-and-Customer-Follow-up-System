import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  getFileExtension,
  isImageFile,
  isPdfFile,
  MAX_ATTACHMENT_SIZE_BYTES,
  sanitizeStorageFileName,
  validateAttachmentFile,
} from './storage';

describe('Storage Helpers and Validation', () => {
  it('formats file sizes accurately in Arabic units', () => {
    expect(formatFileSize(500)).toBe('500 بايت');
    expect(formatFileSize(1024)).toBe('1.0 ك.ب');
    expect(formatFileSize(1536)).toBe('1.5 ك.ب');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 م.ب');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 م.ب');
  });

  it('correctly detects file extensions', () => {
    expect(getFileExtension('receipt.PDF')).toBe('.pdf');
    expect(getFileExtension('image.png')).toBe('.png');
    expect(getFileExtension('no_ext')).toBe('');
  });

  it('correctly identifies images and PDFs', () => {
    expect(isImageFile('photo.JPG')).toBe(true);
    expect(isImageFile('test.jpeg')).toBe(true);
    expect(isImageFile('doc.png')).toBe(true);
    expect(isImageFile('pic.webp')).toBe(true);
    expect(isImageFile('invoice.pdf')).toBe(false);

    expect(isPdfFile('contract.pdf')).toBe(true);
    expect(isPdfFile('photo.png')).toBe(false);
  });

  it('validates allowed file extensions and sizes', () => {
    // Valid file
    const validJpg = validateAttachmentFile({
      name: 'voucher.jpg',
      size: 2 * 1024 * 1024,
      type: 'image/jpeg',
    });
    expect(validJpg.valid).toBe(true);

    const validPdf = validateAttachmentFile({
      name: 'agreement.pdf',
      size: 4.5 * 1024 * 1024,
      type: 'application/pdf',
    });
    expect(validPdf.valid).toBe(true);

    // Oversized file (> 5MB)
    const oversized = validateAttachmentFile({
      name: 'large_doc.pdf',
      size: MAX_ATTACHMENT_SIZE_BYTES + 100,
    });
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toContain('يتجاوز الحد الأقصى');

    // Empty file (0 bytes)
    const emptyFile = validateAttachmentFile({
      name: 'empty.png',
      size: 0,
    });
    expect(emptyFile.valid).toBe(false);
    expect(emptyFile.error).toContain('فارغ');

    // Unsupported extension
    const exeFile = validateAttachmentFile({
      name: 'virus.exe',
      size: 1000,
    });
    expect(exeFile.valid).toBe(false);
    expect(exeFile.error).toContain('غير مدعومة');

    const zipFile = validateAttachmentFile({
      name: 'archive.zip',
      size: 1000,
    });
    expect(zipFile.valid).toBe(false);
  });

  it('sanitizes storage file names cleanly into safe ASCII keys', () => {
    expect(sanitizeStorageFileName('receipt #12 (final).pdf')).toBe('receipt_12_final.pdf');
    expect(sanitizeStorageFileName('تعديلات نظام التحصيل.pdf')).toBe('doc.pdf');
    expect(sanitizeStorageFileName('voucher_101.png')).toBe('voucher_101.png');
  });
});
