'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Bloqueo SÍNCRONO anti doble clic / doble Enter.
 *
 * El estado de React se actualiza de forma asíncrona: dos clics en el mismo
 * frame verían `isSubmitting === false`. El ref se marca en el acto, así que el
 * segundo disparo se descarta antes de llegar a la red.
 */
export function useSubmitLock() {
  const lockRef = useRef(false);
  const montadoRef = useRef(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(accion: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setIsSubmitting(true);
    try {
      return await accion();
    } finally {
      lockRef.current = false;
      if (montadoRef.current) setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, run, isLocked: () => lockRef.current };
}
