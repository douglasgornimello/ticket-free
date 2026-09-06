export function parsePriceText(text: string): number | null {
  const matches = [...text.matchAll(/R\$\s*([\d.,]+)/g)];
  if (matches.length === 0) return null;

  const values = matches.map((match) =>
    parseFloat(match[1].replace(/\./g, '').replace(',', '.')),
  );
  return Math.min(...values);
}
