/**
 * Safely converts Firestore Timestamp, Date, or string to a Date object
 * Returns null if the date is invalid
 */
export function toDate(date: any): Date | null {
  if (!date) return null;
  
  // Already a Date object
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Firestore Timestamp
  if (date && typeof date.toDate === 'function') {
    try {
      const d = date.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  
  // String or number
  try {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Formats a date safely, returning a fallback if invalid
 */
export function formatDate(date: any, options?: Intl.DateTimeFormatOptions): string {
  const d = toDate(date);
  if (!d) return '—';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  
  return d.toLocaleDateString('en-KE', { ...defaultOptions, ...options });
}

/**
 * Formats a date with time
 */
export function formatDateTime(date: any): string {
  const d = toDate(date);
  if (!d) return '—';
  
  return d.toLocaleString('en-KE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
