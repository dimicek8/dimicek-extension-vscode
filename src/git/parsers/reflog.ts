const CHECKOUT = /^checkout: moving from (.+) to (.+)$/;

export function parseRecentCheckouts(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split('\n')) {
    const match = CHECKOUT.exec(line.trim());
    if (!match) {
      continue;
    }
    for (const name of [match[2]!, match[1]!]) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}
