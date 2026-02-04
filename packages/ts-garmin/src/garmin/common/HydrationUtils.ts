export function convertMLToOunces(valueInML: number): number {
  const conversionFactor = 0.033814
  return valueInML * conversionFactor
}

export function convertOuncesToML(ounces: number): number {
  const ouncesToMillilitersConversionFactor = 29.5735
  return ounces * ouncesToMillilitersConversionFactor
}
