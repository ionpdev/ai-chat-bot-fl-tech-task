// Elegant string sorting utilities
export const asc =
  <T>(proj: (t: T) => string) =>
  (a: T, b: T) =>
    proj(a).localeCompare(proj(b), undefined, { sensitivity: "base" })

export const desc =
  <T>(proj: (t: T) => string) =>
  (a: T, b: T) =>
    proj(b).localeCompare(proj(a), undefined, { sensitivity: "base" })

export const sortStrings = (xs: readonly string[]): string[] => {
  return [...xs].sort(asc((x) => x))
}

export const sortStringsDesc = (xs: readonly string[]): string[] => {
  return [...xs].sort(desc((x) => x))
}
