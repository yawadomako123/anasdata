export const cedis = (n) => `GHS ${Number(n).toFixed(2)}`;

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const prettyDate = (iso) =>
  new Date(iso).toLocaleString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// Ghana mobile number: 0 + [2,3,5] + 8 more digits (10 total)
export const isValidGhPhone = (phone) => /^0[235][0-9]{8}$/.test((phone || '').trim());

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
