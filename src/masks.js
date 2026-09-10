export function maskPhoneBR(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.replace(/^(\d*)/, "($1");
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d*)/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
}

export function onPhoneInput(event) {
  event.currentTarget.value = maskPhoneBR(event.currentTarget.value);
}

export function maskCNPJ(value) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function isValidCNPJ(value) {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calcDigit = (base) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, num, i) => acc + Number(num) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const base = d.slice(0, 12);
  const d1 = calcDigit(base);
  const d2 = calcDigit(base + d1);
  return d === base + String(d1) + String(d2);
}

export function onCNPJInput(event) {
  event.currentTarget.value = maskCNPJ(event.currentTarget.value);
  event.currentTarget.setCustomValidity("");
}

export function validateCNPJField(input) {
  if (!input) return true;
  if (input.value && !isValidCNPJ(input.value)) {
    input.setCustomValidity("CNPJ inválido. Confira os números digitados.");
    input.reportValidity();
    return false;
  }
  input.setCustomValidity("");
  return true;
}

export function isValidPhoneBR(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export function validatePhoneField(input) {
  if (!input) return true;
  if (input.value && !isValidPhoneBR(input.value)) {
    input.setCustomValidity("Número inválido. Inclua DDD e número completo.");
    input.reportValidity();
    return false;
  }
  input.setCustomValidity("");
  return true;
}
