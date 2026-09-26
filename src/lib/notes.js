export const MAX_NOTE_WORDS = 200;
export const MAX_NOTE_CHARS = 8000;

export function countWords(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function clampNote(text) {
  let value = String(text ?? "").replace(/\u0000/g, "");
  if (value.length > MAX_NOTE_CHARS) value = value.slice(0, MAX_NOTE_CHARS);
  if (countWords(value) <= MAX_NOTE_WORDS) return value;

  let count = 0;
  let end = value.length;
  const pattern = /\S+/g;
  let match = pattern.exec(value);
  while (match) {
    count += 1;
    if (count === MAX_NOTE_WORDS) {
      end = match.index + match[0].length;
      break;
    }
    match = pattern.exec(value);
  }
  return value.slice(0, end);
}
