import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastState {
  show: (message: string, isError?: boolean) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, isError = false) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, isError }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const value = useMemo<ToastState>(
    () => ({ show, error: (m: string) => show(m, true) }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[200] flex flex-col items-center gap-2 px-4 pb-safe">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`max-w-md rounded-md px-5 py-2.5 text-[13px] text-white shadow-md ${
              t.isError ? 'bg-red-500' : 'bg-gray-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast يجب أن يُستخدم داخل ToastProvider');
  return ctx;
}

/** رسالة خطأ موحّدة من أي استثناء. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'حدث خطأ غير متوقع';
}
