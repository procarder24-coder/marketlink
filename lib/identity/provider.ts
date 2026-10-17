import "server-only";

export type VerificationSession = {
  provider: string;
  status: "not_configured";
  message: string;
};

export function getVerificationProviderStatus(): VerificationSession {
  return {
    provider: process.env.KYC_PROVIDER_NAME ?? "none",
    status: "not_configured",
    message: "No identity provider adapter is configured. Do not collect identity documents or biometrics.",
  };
}

export async function createHostedVerificationSession(): Promise<never> {
  throw new Error("A verified identity-provider adapter and credentials are required before KYC can start.");
}

