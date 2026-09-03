const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(length = 6) {
  const values = crypto.getRandomValues(new Uint32Array(length))

  return Array.from(
    values,
    (value) => ALPHABET[value % ALPHABET.length],
  ).join('')
}
