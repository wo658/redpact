export class PaymentError extends Error {
  transient: boolean
  constructor(message: string, transient: boolean) {
    super(message)
    this.transient = transient
  }
}
export function createPayment({
  transientFailures = 0,
  permanent = false,
  unknownFailure = false,
}: {
  transientFailures?: number
  permanent?: boolean
  unknownFailure?: boolean
} = {}) {
  let attempts = 0
  async function provider(_amount: number): Promise<void> {
    attempts += 1
    if (unknownFailure) {
      throw new Error("Unexpected provider error")
    }
    if (permanent) {
      throw new PaymentError("Payment declined", false)
    }
    if (transientFailures > 0) {
      transientFailures -= 1
      throw new PaymentError("Payment unavailable", true)
    }
  }
  return {
    attempts: () => attempts,
    async charge(amount: number): Promise<void> {
      await provider(amount)
    },
  }
}
