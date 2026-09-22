export const PARTNER_CONSENTED_EVENT = "partner_consented";

export function partnerConsentedEventBody(participantId: string): string {
  return JSON.stringify({
    type: PARTNER_CONSENTED_EVENT,
    participantId,
  });
}