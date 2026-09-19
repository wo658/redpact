// Explicit in-process payment mock. No gateway or network service is contacted.
export function paymentMock({ failures = 0 } = {}) {
  const charges = []
  return {
    charges,
    async charge(totalCents) {
      if (failures > 0) {
        failures -= 1
        throw new Error("Payment unavailable")
      }
      charges.push(totalCents)
    },
  }
}
