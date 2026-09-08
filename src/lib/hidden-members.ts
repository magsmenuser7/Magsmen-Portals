/** People hidden from rosters / workload widgets (requested by the client). */
export const HIDDEN_MEMBER_NAMES = ["sandeep n"];

export function isHiddenMember(name: string | undefined | null): boolean {
  return HIDDEN_MEMBER_NAMES.includes((name ?? "").trim().toLowerCase());
}

export function withoutHiddenMembers<T extends { name: string }>(list: T[]): T[] {
  return list.filter((m) => !isHiddenMember(m.name));
}
