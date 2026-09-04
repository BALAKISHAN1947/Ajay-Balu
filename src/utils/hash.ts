import crypto from 'node:crypto';

export interface BasketHashParams {
  sessionId: string;
  intentId?: string;
  skus: string[];
  variantId: string;
  totalInr: number;
}

/**
 * Computes a deterministic SHA-256 hash of the exact basket contents and customer intent.
 * The SKU list is sorted to ensure determinism.
 */
export function computeBasketHash(params: BasketHashParams): string {
  const sortedSkus = [...params.skus].sort();
  const canonicalString = [
    `session:${params.sessionId}`,
    `intent:${params.intentId || 'none'}`,
    `variant:${params.variantId}`,
    `amount:${params.totalInr}`,
    `skus:${sortedSkus.join(',')}`
  ].join('|');

  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
