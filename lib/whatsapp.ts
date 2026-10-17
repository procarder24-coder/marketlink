export function buildWhatsAppClickToChatUrl(input: {
  phone: string;
  orderReference: string;
  vendorName: string;
  items: string[];
  amountGhs: string;
  orderUrl?: string;
}) {
  const digits = input.phone.replace(/\D/g, "");
  const ghanaPhone = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  if (!/^233\d{9}$/.test(ghanaPhone)) throw new Error("Enter a valid Ghanaian WhatsApp phone number.");
  const lines = [
    `Hello ${input.vendorName}, I have a question about my MarketLink order.`,
    `Order: ${input.orderReference}`,
    ...input.items.map((item) => `• ${item}`),
    `Order amount: GH₵ ${input.amountGhs}`,
    ...(input.orderUrl ? [`Order details: ${input.orderUrl}`] : []),
  ];
  return `https://wa.me/${ghanaPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

