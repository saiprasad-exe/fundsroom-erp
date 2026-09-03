// Browser auth storage for Supabase.
// Uses localStorage in the browser and no storage during SSR.

export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.localStorage;
}
