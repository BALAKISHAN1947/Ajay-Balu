import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inrToPaise, paiseToInr } from '../src/utils/currency.ts';

describe('Authoritative Currency Utility (INR <-> Paise)', () => {
  it('1. Correctly converts integer INR to paise (₹1 = 100 paise)', () => {
    assert.equal(inrToPaise(1), 100);
    assert.equal(inrToPaise(100), 10000);
    assert.equal(inrToPaise(67297), 6729700);
    assert.equal(inrToPaise(0), 0);
  });

  it('2. Primary scenario total ₹67,297 converts exactly to 6,729,700 paise', () => {
    const totalInr = 67297;
    const paise = inrToPaise(totalInr);
    assert.equal(paise, 6729700);
    assert.equal(paiseToInr(paise), 67297);
  });

  it('3. Rejects NaN with RangeError', () => {
    assert.throws(() => inrToPaise(NaN), {
      name: 'RangeError',
      message: /NaN is not allowed/
    });
  });

  it('4. Rejects Infinity and -Infinity with RangeError', () => {
    assert.throws(() => inrToPaise(Infinity), {
      name: 'RangeError',
      message: /Infinity is not allowed/
    });
    assert.throws(() => inrToPaise(-Infinity), {
      name: 'RangeError',
      message: /Infinity is not allowed/
    });
  });

  it('5. Rejects negative amounts with RangeError', () => {
    assert.throws(() => inrToPaise(-500), {
      name: 'RangeError',
      message: /negative value/
    });
    assert.throws(() => inrToPaise(-1), {
      name: 'RangeError',
      message: /negative value/
    });
  });

  it('6. Rejects fractional INR amounts in integer catalog pricing', () => {
    assert.throws(() => inrToPaise(49999.5), {
      name: 'RangeError',
      message: /fractional amounts/
    });
    assert.throws(() => inrToPaise(0.99), {
      name: 'RangeError',
      message: /fractional amounts/
    });
  });

  it('7. Rejects non-number types with TypeError', () => {
    assert.throws(() => inrToPaise('67297' as any), {
      name: 'TypeError',
      message: /expected number/
    });
    assert.throws(() => inrToPaise(null as any), {
      name: 'TypeError',
      message: /expected number/
    });
    assert.throws(() => inrToPaise(undefined as any), {
      name: 'TypeError',
      message: /expected number/
    });
  });
});
