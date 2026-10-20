// Collects the results of the reconciliation checks and prints them.

interface Group {
  checked: number;
  skipped: number;
  failures: string[];
}

export class Report {
  private groups = new Map<string, Group>();
  private notes: string[] = [];

  private group(name: string): Group {
    let found = this.groups.get(name);
    if (!found) {
      found = { checked: 0, skipped: 0, failures: [] };
      this.groups.set(name, found);
    }
    return found;
  }

  /** Compares an amount in euros (what the sheet saved) with cents (what the engine computed). */
  money(group: string, label: string, expectedEuros: number | null, actualCents: number, tolerance = 0.012) {
    const g = this.group(group);
    g.checked++;
    const expected = expectedEuros ?? 0;
    const actual = actualCents / 100;
    if (Math.abs(expected - actual) > tolerance) {
      g.failures.push(`${label}: sheet ${expected.toFixed(4)} vs engine ${actual.toFixed(4)}`);
    }
  }

  equal(group: string, label: string, expected: unknown, actual: unknown) {
    const g = this.group(group);
    g.checked++;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      g.failures.push(`${label}: sheet ${JSON.stringify(expected)} vs engine ${JSON.stringify(actual)}`);
    }
  }

  fail(group: string, message: string) {
    const g = this.group(group);
    g.checked++;
    g.failures.push(message);
  }

  skip(group: string, why: string) {
    this.group(group).skipped++;
    this.notes.push(`${group}: ${why}`);
  }

  /** Prints the report and returns true when every check passed. */
  print(): boolean {
    let failed = 0;
    for (const [name, g] of this.groups) {
      const bad = g.failures.length;
      failed += bad;
      const skipped = g.skipped > 0 ? `, ${g.skipped} skipped` : "";
      console.log(`${bad === 0 ? "OK  " : "FAIL"} ${name}: ${g.checked - bad}/${g.checked} match${skipped}`);
      for (const failure of g.failures.slice(0, 12)) console.log(`       - ${failure}`);
      if (bad > 12) console.log(`       ... and ${bad - 12} more`);
    }
    if (this.notes.length > 0) {
      console.log("\nNotes:");
      for (const note of [...new Set(this.notes)]) console.log(` - ${note}`);
    }
    console.log(failed === 0 ? "\nAll checks match." : `\n${failed} check(s) differ.`);
    return failed === 0;
  }
}
