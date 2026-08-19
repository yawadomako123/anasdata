import { prettyDate } from './format';

const COLUMNS = [
  ['reference', 'Reference'],
  ['created_at', 'Ordered At'],
  ['channel', 'Via'],
  ['network', 'Network'],
  ['bundle_name', 'Package'],
  ['data', 'Data'],
  ['phone', 'Phone Number'],
  ['price', 'Amount (GHS)'],
  ['status', 'Status'],
  ['payer_phone', 'Paid By'],
  ['email', 'Email'],
];

const escapeCsv = (val) => {
  const s = val == null ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Turn a list of orders into a CSV order sheet and trigger a download.
 * This is the sheet you hand to whoever loads the bundles: phone + package.
 */
export function downloadOrderSheet(orders, filename) {
  const header = COLUMNS.map(([, label]) => label).join(',');
  const rows = orders.map((o) =>
    COLUMNS.map(([key]) => {
      if (key === 'created_at') return escapeCsv(prettyDate(o.created_at));
      if (key === 'price') return escapeCsv(Number(o.price).toFixed(2));
      return escapeCsv(o[key]);
    }).join(',')
  );

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
