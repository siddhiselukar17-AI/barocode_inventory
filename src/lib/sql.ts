/** Escapes % and _ so user input is matched literally inside a LIKE pattern. */
export function likeContains(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Collects WHERE fragments + params. Only static SQL fragments are ever added; values are always parameters. */
export class Where {
  private parts: string[] = [];
  readonly params: unknown[] = [];

  add(sql: string, ...params: unknown[]) {
    this.parts.push(sql);
    this.params.push(...params);
  }

  get sql() {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : "";
  }
}
