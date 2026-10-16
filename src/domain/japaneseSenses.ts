/** Split only explicit workbook bullets; keep punctuation within each sense. */
export function japaneseSenses(value: string): string[] {
  const text = value.trim();
  if (!text.startsWith('・')) return text ? [text] : [];
  return text.split(/(?:^|\s+)・/u).map((sense) => sense.trim()).filter(Boolean);
}
