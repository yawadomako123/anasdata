// The order sheet handed to whoever loads the bundles: just the number to
// top up and the data they bought (package name includes the network).
const COLUMNS = [
  ['phone', 'Phone Number'],
  ['bundle_name', 'Data'],
];

const escapeCsv = (val) => {
  const s = val == null ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Turn a list of orders into a CSV order sheet and trigger a download. */
export function downloadOrderSheet(orders, filename) {
  const header = COLUMNS.map(([, label]) => label).join(',');
  const rows = orders.map((o) => COLUMNS.map(([key]) => escapeCsv(o[key])).join(','));

  // BOM so Excel reads UTF-8 correctly
  const csv = '﻿' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `order-sheet-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
