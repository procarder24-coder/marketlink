export function normalizeMtnMomoPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  if (!/^233\d{9}$/.test(normalized)) {
    throw new Error("Enter a valid Ghanaian mobile money number.");
  }
  return normalized;
}

export function pesewasToMtnAmount(amountPesewas: number) {
  if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) {
    throw new Error("Payment amount must be a positive integer number of pesewas.");
  }
  return `${Math.floor(amountPesewas / 100)}.${String(amountPesewas % 100).padStart(2, "0")}`;
}

export function mtnAmountToPesewas(amount: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error("MTN MoMo returned an invalid amount.");
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const amountPesewas = whole * 100 + fraction;
  if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) {
    throw new Error("MTN MoMo returned an invalid amount.");
  }
  return amountPesewas;
}
