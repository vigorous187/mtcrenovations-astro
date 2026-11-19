export function isValidPhone(input: string): boolean {
  if (!input) return false;
  if (/[A-Za-z]/.test(input)) return false;
  // Allowed characters only: digits, spaces, +, (, ), -, .
  if (!/^[0-9\s+().-]+$/.test(input)) return false;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length === 10;
}
