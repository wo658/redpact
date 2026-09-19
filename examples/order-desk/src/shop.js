// A single-product, in-memory application core; each instance is an isolated shop.
export function createShop({ stock, priceCents, charge }) {
  const orders = []
  return {
    stock: () => stock,
    orders: () => orders.map((order) => ({ ...order })),
    async checkout({ quantity }) {
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("Invalid quantity")
      }
      if (quantity > stock) {
        throw new Error("Out of stock")
      }
      const totalCents = quantity * priceCents
      // Reserve before awaiting payment so another checkout cannot sell the same stock.
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
