type Order = { id: number; quantity: number; totalCents: number }
export function createShop({
  stock,
  priceCents,
  charge,
}: {
  stock: number
  priceCents: number
  charge: (amount: number) => Promise<void>
}) {
  // Historical seed orders let the UI task run independently of checkout input changes.
  const orders: Order[] = [1, 2, 3].map((quantity) => ({
    id: quantity,
    quantity,
    totalCents: quantity * priceCents,
  }))
  return {
    stock: () => stock,
    orders: () => orders.map((order) => ({ ...order })),
    async checkout({ quantity }: { quantity: number }) {
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("Invalid quantity")
      }
      if (quantity > stock) {
        throw new Error("Out of stock")
      }
      const totalCents = quantity * priceCents
      stock -= quantity
      try {
        await charge(totalCents)
      } catch (error) {
        stock += quantity
        throw error
      }
      const order = { id: orders.length + 1, quantity, totalCents }
      orders.push(order)
      return { ...order }
    },
  }
}
