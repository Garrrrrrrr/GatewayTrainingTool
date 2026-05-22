import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * AES-256-GCM field-level encryption for sensitive data (SSNs, SINs, salary figures,
 * background check results, etc.).
 *
 * Setup:
 *   1. Generate a 32-byte key and store it as FIELD_ENCRYPTION_KEY in your environment:
 *        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   2. Never commit FIELD_ENCRYPTION_KEY to source control.
 *   3. Rotate keys by re-encrypting records; keep old key available during rotation.
 *
 * Usage:
 *   const cipher = encrypt('123-45-6789')   // store cipher.iv + ':' + cipher.ciphertext
 *   const plain  = decrypt(cipher.iv, cipher.ciphertext)
 *
 * Storage convention: store as "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12    // GCM recommended nonce size
const TAG_BYTES = 16   // GCM auth tag size

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('FIELD_ENCRYPTION_KEY environment variable is not set')
  }
  // Accept a 64-char hex string (32 bytes) or derive a 32-byte key via scrypt
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  // Fallback: derive using scrypt with a static salt (not ideal — prefer the hex form)
  return scryptSync(raw, 'training-tool-salt', 32)
}

export interface EncryptedValue {
  /** Combined storage string: "<iv_hex>:<ciphertext_hex>:<authTag_hex>" */
  stored: string
}

/** Encrypt a plaintext string. Returns a value safe to store in the database. */
export function encrypt(plaintext: string): EncryptedValue {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const stored = `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
  return { stored }
}

/**
 * Decrypt a value previously produced by `encrypt()`.
 * @param stored - The "<iv_hex>:<ciphertext_hex>:<authTag_hex>" string from the DB column.
 */
export function decrypt(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format')
  }
  const [ivHex, ciphertextHex, tagHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  if (tag.length !== TAG_BYTES) {
    throw new Error('Invalid auth tag length')
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

/**
 * Encrypt a value only if it is non-null/undefined. Useful for optional sensitive fields.
 * Returns null if the input is null/undefined.
 */
export function encryptNullable(value: string | null | undefined): string | null {
  if (value == null) return null
  return encrypt(value).stored
}

/**
 * Decrypt a nullable stored value. Returns null if the input is null/undefined.
 */
export function decryptNullable(stored: string | null | undefined): string | null {
  if (stored == null) return null
  return decrypt(stored)
}
