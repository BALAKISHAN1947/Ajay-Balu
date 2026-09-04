/**
 * Authoritative INR to Paise Currency Conversion Utility
 *
 * Enforces strict integer arithmetic for Razorpay payment integration.
 * In India / Razorpay: 1 INR = 100 paise.
 */

export function inrToPaise(amountInr: number): number {
  if (typeof amountInr !== 'number') {
    throw new TypeError(`Invalid INR amount: expected number, received ${typeof amountInr}`);
  }

  if (Number.isNaN(amountInr)) {
    throw new RangeError('Invalid INR amount: NaN is not allowed');
  }

  if (!Number.isFinite(amountInr)) {
    throw new RangeError('Invalid INR amount: Infinity is not allowed');
  }

  if (amountInr < 0) {
    throw new RangeError(`Invalid INR amount: negative value ${amountInr} is not allowed`);
  }

  if (!Number.isInteger(amountInr)) {
    throw new RangeError(`Invalid INR amount: fractional amounts (${amountInr}) are not supported in integer catalog pricing`);
  }

  if (!Number.isSafeInteger(amountInr)) {
    throw new RangeError(`Invalid INR amount: ${amountInr} exceeds safe integer bounds`);
  }

  const paise = amountInr * 100;

  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`Calculated paise amount exceeds safe integer bounds`);
  }

  return paise;
}

export function paiseToInr(amountPaise: number): number {
  if (typeof amountPaise !== 'number' || !Number.isFinite(amountPaise) || amountPaise < 0) {
    throw new RangeError(`Invalid paise amount: ${amountPaise}`);
  }
  return Math.floor(amountPaise / 100);
}
