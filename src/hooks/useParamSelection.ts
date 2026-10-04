"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * A selection that can be deep-linked (`?task=t-48`) and changed locally.
 * Returns `undefined` when nothing was chosen and there is no URL param — the caller picks a default.
 * A new URL param (e.g. arriving from search or a notification) wins over an older local choice.
 * Derived during render, so there is no effect and no flash of the wrong item.
 */
export function useParamSelection(key: string): [string | null | undefined, (id: string | null) => void] {
  const param = useSearchParams().get(key);
  const [local, setLocal] = useState<{ param: string | null; id: string | null } | null>(null);
  const value = local && local.param === param ? local.id : (param ?? undefined);
  return [value, (id) => setLocal({ param, id })];
}
