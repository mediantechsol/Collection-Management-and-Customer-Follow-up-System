import { useEffect, type ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide = false }: Props) {
  // Escape يغلق المودال — سلوك متوقع لم يكن موجوداً في النموذج الأولي
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(20,24,30,0.5)] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-[10px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-gray-500">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-[18px]">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
