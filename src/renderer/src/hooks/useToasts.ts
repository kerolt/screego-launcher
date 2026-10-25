import { useCallback, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  message: string;
}

const TOAST_MS = 3200;

/** Stacked transient toasts (bottom-center), auto-expiring. */
export function useToasts(): { toasts: ToastItem[]; push: (message: string) => void } {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((list) => [...list.slice(-3), { id, message }]); // keep at most 4
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, TOAST_MS);
  }, []);

  return { toasts, push };
}
