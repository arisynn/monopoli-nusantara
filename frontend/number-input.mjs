// Preserve empty/partial decimal input; never round or coerce a user's amount.
export function normalizeAmountInput(input) {
  const before = input.value;
  const value = before.replace(/^0+(?=\d)/, "");
  if (value === before) return;
  const start = input.selectionStart,
    end = input.selectionEnd;
  const removed = before.length - value.length;
  input.value = value;
  if (start !== null && end !== null)
    input.setSelectionRange(
      Math.max(0, start - removed),
      Math.max(0, end - removed),
    );
}
