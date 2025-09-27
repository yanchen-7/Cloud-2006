const fs = require('fs');
const lines = fs.readFileSync('singapore_data_with_category.csv', 'utf8').split(/\r?\n/);
const header = lines[0].split(',');
const firstLine = lines[1];
const cols = [];
let current = '';
let inQuotes = false;
for (let i = 0; i < firstLine.length; i++) {
  const ch = firstLine[i];
  if (ch === '"') {
    const next = firstLine[i + 1];
    if (inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    inQuotes = !inQuotes;
    continue;
  }
  if (ch === ',' && !inQuotes) {
    cols.push(current);
    current = '';
    continue;
  }
  current += ch;
}
cols.push(current);
const row = {};
header.forEach((h, idx) => {
  row[h] = cols[idx];
});
const raw = row['opening_hours'];
function pythonish(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  let text = String(raw).trim();
  if (!text) return null;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\r?\n/g, "\\n");
  text = text.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  try {
    return Function('"use strict";return (' + text + ');')();
  } catch (err) {
    console.error('error parsing', err.message);
    throw err;
  }
}
const parsed = pythonish(raw);
console.log(parsed);
