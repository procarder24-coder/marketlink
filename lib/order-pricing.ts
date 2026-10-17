export type PricedCartItem = {
  productId: string;
  storeId: string;
  pricePesewas: number;
  quantity: number;
  availableQuantity: number;
};

export function priceCart(items: PricedCartItem[], commissionBasisPoints: number) {
  if (items.length === 0) throw new Error("Cart must contain at least one item.");
  if (!Number.isInteger(commissionBasisPoints) || commissionBasisPoints < 0 || commissionBasisPoints > 10_000) {
    throw new Error("Commission rate must be from 0 to 10,000 basis points.");
  }

  const stores = new Map<string, { subtotalPesewas: number; commissionPesewas: number; vendorNetPesewas: number }>();
  let totalPesewas = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.pricePesewas) || item.pricePesewas <= 0) throw new Error("Product price must be positive pesewas.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new Error("Product quantity is invalid.");
    if (!Number.isInteger(item.availableQuantity) || item.quantity > item.availableQuantity) throw new Error("Requested quantity exceeds available stock.");
    const lineTotal = item.pricePesewas * item.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalPesewas + lineTotal)) throw new Error("Cart total is outside the supported range.");
    const store = stores.get(item.storeId) ?? { subtotalPesewas: 0, commissionPesewas: 0, vendorNetPesewas: 0 };
    store.subtotalPesewas += lineTotal;
    stores.set(item.storeId, store);
    totalPesewas += lineTotal;
  }

  for (const store of stores.values()) {
    store.commissionPesewas = Math.floor((store.subtotalPesewas * commissionBasisPoints) / 10_000);
    store.vendorNetPesewas = store.subtotalPesewas - store.commissionPesewas;
  }
  return { totalPesewas, vendorOrders: [...stores.entries()].map(([storeId, amounts]) => ({ storeId, ...amounts })) };
}

