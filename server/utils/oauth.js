const crypto = require('crypto');

/**
 * Generate a cryptographically secure random state string.
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate PKCE code verifier and code challenge (S256).
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Constant-time string comparison to prevent timing attacks during state validation.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  generateState,
  generatePKCE,
  safeCompare,
};
