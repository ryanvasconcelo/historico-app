export function normalizeBrazilianPhone(input: string) {
  const digits = input.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  let normalized = digits;

  if (normalized.startsWith("00")) {
    normalized = normalized.slice(2);
  }

  if (!normalized.startsWith("55")) {
    normalized = `55${normalized}`;
  }

  if (normalized.length < 12 || normalized.length > 13) {
    return null;
  }

  return normalized;
}

export function displayPhone(phone: string) {
  const normalized = normalizeBrazilianPhone(phone) ?? phone;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return normalized;
}
