import { describe, expect, it } from "vitest";
import { mayAccessAdmin } from "../authorization-policy";
import { priceCart } from "../order-pricing";
import { canTransitionPayment } from "../payment-state";
import { canTransitionApplication, canTransitionStore } from "../vendor-state";
import { buildWhatsAppClickToChatUrl } from "../whatsapp";
import { createGuestAccessToken } from "../guest-token";
import { mtnAmountToPesewas, normalizeMtnMomoPhone, pesewasToMtnAmount } from "../payments/mtn-momo-format";

describe("server authorization policy", () => {
  it("requires the server-assigned admin role and MFA assurance", () => {
    expect(mayAccessAdmin("super_admin", "aal2")).toBe(true);
    expect(mayAccessAdmin("super_admin", "aal1")).toBe(false);
    expect(mayAccessAdmin("buyer", "aal2")).toBe(false);
    expect(mayAccessAdmin(undefined, "aal2")).toBe(false);
  });
});

describe("order calculations", () => {
  it("calculates exact multi-store totals and commissions in pesewas", () => {
    expect(priceCart([
      { productId: "a", storeId: "one", pricePesewas: 10_099, quantity: 2, availableQuantity: 4 },
      { productId: "b", storeId: "two", pricePesewas: 3_500, quantity: 1, availableQuantity: 1 },
    ], 500)).toEqual({
      totalPesewas: 23_698,
      vendorOrders: [
        { storeId: "one", subtotalPesewas: 20_198, commissionPesewas: 1_009, vendorNetPesewas: 19_189 },
        { storeId: "two", subtotalPesewas: 3_500, commissionPesewas: 175, vendorNetPesewas: 3_325 },
      ],
    });
  });

  it("rejects over-stock quantities and malformed monetary amounts", () => {
    expect(() => priceCart([{ productId: "a", storeId: "one", pricePesewas: 50, quantity: 2, availableQuantity: 1 }], 0)).toThrow(/stock/);
    expect(() => priceCart([{ productId: "a", storeId: "one", pricePesewas: 0, quantity: 1, availableQuantity: 1 }], 0)).toThrow(/price/);
  });
});

describe("payment state transitions", () => {
  it("permits trusted pending-to-paid transitions and blocks changes after payment", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("failed", "paid")).toBe(true);
    expect(canTransitionPayment("paid", "failed")).toBe(false);
    expect(canTransitionPayment("cancelled", "paid")).toBe(false);
  });
});

describe("vendor approval and publication transitions", () => {
  it("requires an application review before approval and supports resubmission", () => {
    expect(canTransitionApplication("submitted", "under_review")).toBe(true);
    expect(canTransitionApplication("under_review", "approved")).toBe(true);
    expect(canTransitionApplication("draft", "approved")).toBe(false);
    expect(canTransitionApplication("rejected", "submitted")).toBe(true);
  });

  it("requires an approved vendor before store submission or publication", () => {
    expect(canTransitionStore("draft", "pending_publication", false)).toBe(false);
    expect(canTransitionStore("draft", "pending_publication", true)).toBe(true);
    expect(canTransitionStore("pending_publication", "published", false)).toBe(false);
    expect(canTransitionStore("published", "suspended", true)).toBe(true);
  });
});

describe("WhatsApp click-to-chat", () => {
  it("normalizes Ghana numbers and safely encodes order content", () => {
    const url = buildWhatsAppClickToChatUrl({
      phone: "024 123 4567",
      orderReference: "ML-123",
      vendorName: "Asaase & Co",
      items: ["Basket × 2"],
      amountGhs: "250.00",
    });

    expect(url).toMatch(/^https:\/\/wa\.me\/233241234567\?text=/);
    expect(decodeURIComponent(url)).toContain("Basket × 2");
    expect(() => buildWhatsAppClickToChatUrl({
      phone: "12345",
      orderReference: "ML-123",
      vendorName: "Store",
      items: [],
      amountGhs: "50",
    })).toThrow(/Ghanaian/);
  });
});

describe("guest access token", () => {
  it("creates a 256-bit base64url token accepted by the order API", () => {
    const token = createGuestAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });
});

describe("MTN MoMo payment values", () => {
  it("normalizes Ghanaian mobile numbers and converts pesewas exactly", () => {
    expect(normalizeMtnMomoPhone("024 123 4567")).toBe("233241234567");
    expect(normalizeMtnMomoPhone("+233 24 123 4567")).toBe("233241234567");
    expect(pesewasToMtnAmount(12_345)).toBe("123.45");
    expect(pesewasToMtnAmount(5)).toBe("0.05");
    expect(mtnAmountToPesewas("123.45")).toBe(12_345);
    expect(mtnAmountToPesewas("0.05")).toBe(5);
  });

  it("rejects invalid Ghanaian numbers and unsafe amounts", () => {
    expect(() => normalizeMtnMomoPhone("12345")).toThrow(/Ghanaian/);
    expect(() => pesewasToMtnAmount(0)).toThrow(/positive/);
    expect(() => pesewasToMtnAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow(/positive/);
    expect(() => mtnAmountToPesewas("1.001")).toThrow(/invalid amount/);
    expect(() => mtnAmountToPesewas("0")).toThrow(/invalid amount/);
  });
});
