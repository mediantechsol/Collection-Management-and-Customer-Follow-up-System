/**
 * دوال التخزين السحابي لمرفقات المتابعات (Supabase Storage).
 * تشمل التحقق من سلامة الملف، الرفع الآمن، توليد الروابط الموقّعة، والمعاينة/التنزيل.
 */

import { supabase } from './supabase';

export const FOLLOWUP_ATTACHMENTS_BUCKET = 'followup-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'] as const;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** تنسيق حجم الملف للعرض باللغة العربية */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** هل الملف صورة مدعومة بناءً على امتداده */
export function isImageFile(filenameOrPath: string): boolean {
  const lower = filenameOrPath.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
}

/** هل الملف مستند PDF بناءً على امتداده */
export function isPdfFile(filenameOrPath: string): boolean {
  return filenameOrPath.toLowerCase().endsWith('.pdf');
}

/** استخراج الامتداد من اسم الملف */
export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx).toLowerCase();
}

/**
 * التحقق من قيود الملف (الحجم والنوع والصيغة).
 */
export function validateAttachmentFile(file: { name: string; size: number; type?: string }): {
  valid: boolean;
  error?: string;
} {
  if (!file || !file.name) {
    return { valid: false, error: 'الملف غير صالح أو لم يتم اختياره' };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'الملف فارغ (0 بايت)' };
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `حجم الملف (${formatFileSize(file.size)}) يتجاوز الحد الأقصى المسموح به (5 ميجابايت)`,
    };
  }

  const ext = getFileExtension(file.name);
  const isValidExt = ALLOWED_EXTENSIONS.some((allowed) => allowed === ext);

  if (!isValidExt) {
    return {
      valid: false,
      error: 'صيغة الملف غير مدعومة. الصيغ المسموحة: JPG, PNG, WEBP, PDF فقط',
    };
  }

  if (file.type) {
    const mime = file.type.toLowerCase();
    const isValidMime = ALLOWED_MIME_TYPES.some((allowed) => allowed === mime);
    if (!isValidMime && !isValidExt) {
      return {
        valid: false,
        error: 'نوع الملف غير مسموح به',
      };
    }
  }

  return { valid: true };
}

/** تنظيف اسم الملف ليكون مساراً آمناً متوافقاً مع Supabase Storage و S3 */
export function sanitizeStorageFileName(filename: string): string {
  const ext = getFileExtension(filename);
  const base = filename.slice(0, filename.length - ext.length);
  // تحويل الحروف غير اللاتينية والرموز إلى ASCII آمن تماماً
  const cleanBase = base
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `${cleanBase || 'doc'}${ext}`;
}

export interface UploadProgress {
  percent: number;
  label: string;
}

/**
 * رفع ملف مرفق للمتابعة إلى Supabase Storage.
 * المسار المنشأ يكون: `<customerId>/<timestamp>_<random>_<safe_ascii_name>`
 */
export async function uploadFollowupAttachment(
  customerId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ path: string; name: string }> {
  onProgress?.({ percent: 15, label: 'جاري فحص وتجهيز الملف للرفع…' });

  const validation = validateAttachmentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'الملف غير صالح للرفع');
  }

  const safeName = sanitizeStorageFileName(file.name);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const filePath = `${customerId}/${Date.now()}_${randomSuffix}_${safeName}`;

  onProgress?.({ percent: 35, label: 'جاري الاتصال بحاوية التخزين السحابي…' });

  // محاكاة تقدم ديناميكي أثناء نقل البيانات
  const progressInterval = setInterval(() => {
    onProgress?.({ percent: 70, label: 'جاري رفع ونقل البيانات إلى السحابة…' });
  }, 250);

  try {
    const { data, error } = await supabase.storage
      .from(FOLLOWUP_ATTACHMENTS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    clearInterval(progressInterval);

    if (error) {
      if (error.message.toLowerCase().includes('bucket not found')) {
        throw new Error(
          'حاوية التخزين (followup-attachments) غير موجودة في Supabase. يرجى تشغيل ملف Migration رقم 07 أو إنشاء الـ Bucket من لوحة التحكم.',
        );
      }
      throw new Error(`فشل رفع المرفق: ${error.message}`);
    }

    onProgress?.({ percent: 90, label: 'تم استلام الملف، جاري ربطه بالمتابعة…' });

    return {
      path: data.path,
      name: file.name,
    };
  } catch (err) {
    clearInterval(progressInterval);
    throw err;
  }
}

/**
 * إنشاء رابط مؤقت آمن (Signed URL) لقراءة أو تحميل الملف.
 * صالح افتراضياً لمدة 60 دقيقة.
 */
export async function getSignedAttachmentUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(FOLLOWUP_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`تعذّر توليد رابط الوصول للملف: ${error?.message || 'خطأ غير معروف'}`);
  }

  return data.signedUrl;
}

/**
 * تنزيل الملف وحفظه محلياً على جهاز المستخدم بأمان.
 */
export async function downloadAttachment(path: string, downloadName?: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from(FOLLOWUP_ATTACHMENTS_BUCKET)
    .download(path);

  if (error || !data) {
    throw new Error(`تعذّر تحميل الملف: ${error?.message || 'الملف غير موجود'}`);
  }

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName || path.split('/').pop() || 'attachment';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * حذف ملف مرفق من Storage (إذا لزم الأمر).
 */
export async function deleteAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(FOLLOWUP_ATTACHMENTS_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`تعذّر حذف المرفق: ${error.message}`);
  }
}
