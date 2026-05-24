export const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export const toCsv = (rows: Record<string, unknown>[], columns: { key: string; label: string }[]) => {
  const header = columns.map(c => csvEscape(c.label)).join(',')
  const body = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(',')).join('\n')
  return `${header}\n${body}\n`
}
