export function normalizeDatabaseUrl(rawValue?: string): string | undefined {
  if (!rawValue) return undefined;

  let value = rawValue.trim();
  if (value.startsWith('DATABASE_URL=')) value = value.slice('DATABASE_URL='.length).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  if (!/^postgres(?:ql)?:\/\//i.test(value)) return value;

  const url = new URL(value);
  if (url.port === '6543') {
    if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
  }
  return url.toString();
}
