/**
 * VowVet contact information — single source of truth.
 *
 * Update HERE = update everywhere (UI, push bodies, bot replies, seeds).
 *
 * Use the helpers (getZaloLink/getHotlineDisplay/...) instead of reaching into
 * the object so future field renames don't break callers.
 */
export const VOWVET_CONTACT = {
  // Zalo Official Account — chat support, share content, emergency follow-up
  zaloOA: {
    url: "https://zalo.me/1136810892220003266",
    oaId: "1136810892220003266",
    displayName: "VowVet Mon Min",
  },

  // Hotline — bác sĩ + cấp cứu (same number, 24/7)
  hotline: {
    display: "0779 029 133",      // pretty display
    raw: "0779029133",            // unformatted, for data-clipboard
    e164: "+84779029133",         // international, for tel: links + Baserow contact_phone
    purpose: "Bác sĩ tư vấn + Cấp cứu 24/7",
  },

  // Telegram admin chat (internal alerts to Meliodas)
  telegramAdmin: {
    chatId: "1740998649",
  },

  // Brand
  brand: {
    legalName: "CTY TNHH Duy Trường Phát",
    productName: "VowVet",
    parentBrand: "Mon Min Pet",
    tagline: "Người bạn đồng hành sức khỏe cho thú cưng",
    supportEmail: "vowvet@monminpet.com",
  },
} as const;

// ============================================================
// Helpers — prefer these over reaching into VOWVET_CONTACT
// ============================================================
export function getZaloLink(): string {
  return VOWVET_CONTACT.zaloOA.url;
}

export function getHotlineDisplay(): string {
  return VOWVET_CONTACT.hotline.display;
}

export function getHotlineTelLink(): string {
  return `tel:${VOWVET_CONTACT.hotline.e164}`;
}

export function getHotlineRaw(): string {
  return VOWVET_CONTACT.hotline.raw;
}

export function getHotlineE164(): string {
  return VOWVET_CONTACT.hotline.e164;
}

export function getSupportEmail(): string {
  return VOWVET_CONTACT.brand.supportEmail;
}
