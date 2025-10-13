import { describe, it, expect } from "vitest"
import { sortStrings, sortStringsDesc, asc } from "./sortStrings"

describe("sortStrings", () => {
  it("returns a new sorted array and does not mutate the input", () => {
    const input = ["Banana", "apple", "Äpfel", "banana"] as const
    const original = [...input]

    const result = sortStrings(input)

    // Should return a sorted array
    expect(result).toEqual(
      ["apple", "Äpfel", "Banana", "banana"].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      )
    )

    // Should not mutate the original array
    expect(input).toEqual(original)

    // Should return a new array
    expect(result).not.toBe(input)
  })

  it("handles empty and single element arrays", () => {
    expect(sortStrings([])).toEqual([])
    expect(sortStrings(["only"])).toEqual(["only"])
  })

  it("sorts case-insensitively with locale awareness", () => {
    const input = ["zebra", "Apple", "banana", "CHERRY"]
    const result = sortStrings(input)

    // Should be sorted alphabetically, case-insensitive
    expect(result).toEqual(["Apple", "banana", "CHERRY", "zebra"])
  })

  it("handles special characters and accents", () => {
    const input = ["café", "apple", "naïve", "resume"]
    const result = sortStrings(input)

    // Should handle accented characters properly
    expect(result).toContain("café")
    expect(result).toContain("naïve")
  })
})

describe("sortStringsDesc", () => {
  it("sorts strings in descending order", () => {
    const input = ["apple", "banana", "cherry"]
    const result = sortStringsDesc(input)

    expect(result).toEqual(["cherry", "banana", "apple"])
    expect(result).not.toBe(input) // Should not mutate
  })
})

describe("asc utility", () => {
  it("creates ascending comparator function", () => {
    const users = [
      { name: "John", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 35 },
    ]

    const sortedByName = [...users].sort(asc((user) => user.name))

    expect(sortedByName.map((u) => u.name)).toEqual(["Alice", "Bob", "John"])
  })
})
