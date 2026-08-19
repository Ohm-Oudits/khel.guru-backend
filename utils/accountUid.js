import crypto from "crypto";

// Crockford base32: no I, L, O, U to avoid ambiguity in support conversations.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ACCOUNT_UID_PREFIX = "KG-";
const ACCOUNT_UID_LENGTH = 12;

export const ACCOUNT_UID_PATTERN = /^KG-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;

export const generateAccountUid = () => {
  const bytes = crypto.randomBytes(ACCOUNT_UID_LENGTH);
  let uid = ACCOUNT_UID_PREFIX;
  for (let i = 0; i < ACCOUNT_UID_LENGTH; i += 1) {
    uid += CROCKFORD_ALPHABET[bytes[i] % CROCKFORD_ALPHABET.length];
  }
  return uid;
};
