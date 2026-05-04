import { useState } from "react";

export function useEntityForm<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(next: T) {
    setValue(next);
    setDirty(true);
  }

  function reset() {
    setValue(initial);
    setDirty(false);
    setError(null);
  }

  return { value, onChange, dirty, reset, error, setError };
}
