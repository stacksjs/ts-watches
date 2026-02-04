export function gramsToPounds(weightInGrams: number): number {
  const gramsPerPound = 453.592
  return weightInGrams / gramsPerPound
}

export function poundsToGrams(weightInPounds: number): number {
  const gramsPerPound = 453.592
  return weightInPounds * gramsPerPound
}

export function kilogramsToGrams(weightInKg: number): number {
  return weightInKg * 1000
}

export function gramsToKilograms(weightInGrams: number): number {
  return weightInGrams / 1000
}
