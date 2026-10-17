import "server-only";

import { mtnAmountToPesewas, normalizeMtnMomoPhone, pesewasToMtnAmount } from "./mtn-momo-format";

const MOMO_API_BASE_URL = "https://sandbox.momodeveloper.mtn.com";

type MomoCredentials = {
  apiUser: string;
  apiKey: string;
  subscriptionKey: string;
};

function getCredentials(): MomoCredentials {
  const apiUser = process.env.MTN_MOMO_API_USER;
  const apiKey = process.env.MTN_MOMO_API_KEY;
  const subscriptionKey = process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY;
  if (!apiUser || !apiKey || !subscriptionKey) {
    throw new Error("MTN MoMo sandbox credentials are not configured.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiUser)) {
    throw new Error("MTN MoMo API user must be a UUID.");
  }
  return { apiUser, apiKey, subscriptionKey };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("MTN MoMo returned an invalid JSON response.");
  }
}

async function requestAccessToken(credentials: MomoCredentials) {
  const response = await fetch(`${MOMO_API_BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.apiUser}:${credentials.apiKey}`).toString("base64")}`,
      "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("MTN MoMo authentication failed.");
  const data = await readJson(response);
  if (!data || typeof data !== "object" || !("access_token" in data)
    || typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("MTN MoMo did not return an access token.");
  }
  return data.access_token;
}

export async function requestMtnMomoPayment(input: {
  reference: string;
  amountPesewas: number;
  phone: string;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.reference)) {
    throw new Error("MTN MoMo reference must be a UUID.");
  }
  const credentials = getCredentials();
  const accessToken = await requestAccessToken(credentials);
  const response = await fetch(`${MOMO_API_BASE_URL}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Reference-Id": input.reference,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: pesewasToMtnAmount(input.amountPesewas),
      currency: "GHS",
      externalId: input.reference,
      payer: {
        partyIdType: "MSISDN",
        partyId: normalizeMtnMomoPhone(input.phone),
      },
      payerMessage: "MarketLink order payment",
      payeeNote: "MarketLink order",
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (response.status !== 202) {
    throw new Error("MTN MoMo did not accept the payment request.");
  }
}

export async function getMtnMomoPaymentStatus(reference: string, expectedAmountPesewas: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) {
    throw new Error("MTN MoMo reference must be a UUID.");
  }
  const credentials = getCredentials();
  const accessToken = await requestAccessToken(credentials);
  const response = await fetch(
    `${MOMO_API_BASE_URL}/collection/v1_0/requesttopay/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Target-Environment": "sandbox",
        "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("MTN MoMo could not verify this payment.");
  const data = await readJson(response);
  if (!data || typeof data !== "object"
    || !("status" in data) || typeof data.status !== "string"
    || !("amount" in data) || typeof data.amount !== "string"
    || !("currency" in data) || data.currency !== "GHS") {
    throw new Error("MTN MoMo payment verification returned an invalid response.");
  }
  if (mtnAmountToPesewas(data.amount) !== expectedAmountPesewas) {
    throw new Error("Verified MTN MoMo amount does not match the order.");
  }
  if (data.status !== "PENDING" && data.status !== "SUCCESSFUL" && data.status !== "FAILED") {
    throw new Error("MTN MoMo returned an unsupported payment status.");
  }
  return {
    status: data.status === "SUCCESSFUL" ? "paid" as const
      : data.status === "FAILED" ? "failed" as const
        : "pending" as const,
    providerTransactionId: "financialTransactionId" in data && typeof data.financialTransactionId === "string"
      ? data.financialTransactionId
      : reference,
    amountPesewas: expectedAmountPesewas,
  };
}
