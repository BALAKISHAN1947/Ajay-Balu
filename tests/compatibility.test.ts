import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkLaptopBagCompatibility, checkLaptopMouseCompatibility } from '../src/engine/compatibility.ts';
import { LAPTOPS, BAGS, MICE } from '../src/data/catalog.ts';

describe('Compatibility Engine', () => {
  const aeroBook14 = LAPTOPS.find((l) => l.sku === 'NX-LP-AERO14-01')!; // 14", 312.4 x 221.2 x 15.5 mm, 1x USB-A
  const devForge15 = LAPTOPS.find((l) => l.sku === 'NX-LP-DEV15-02')!;  // 15.6", 358.0 x 248.0 x 18.2 mm, 2x USB-A
  const airLite13 = LAPTOPS.find((l) => l.sku === 'NX-LP-LITE13-06')!;  // 13.3", 298.0 x 206.0 x 13.9 mm, 0x USB-A
  const codeCraft14 = LAPTOPS.find((l) => l.sku === 'NX-LP-CODE14-04')!; // 14", 2x USB-A

  const slimBag14 = BAGS.find((b) => b.sku === 'NX-BG-SLIM-01')!;       // max 330 x 235 x 22 mm
  const tinySleeve13 = BAGS.find((b) => b.sku === 'NX-BG-TINY-04')!;   // max 305 x 212 x 16 mm

  const btMouse = MICE.find((m) => m.sku === 'NX-MS-ERGO-01')!;        // Bluetooth + 2.4GHz
  const dongleOnlyMouse = MICE.find((m) => m.sku === 'NX-MS-DONGLE-02')!; // 2.4GHz Dongle ONLY (No BT)

  it('5. Correct bag passes dimension check (AeroBook 14 + Slim Bag 14)', () => {
    const result = checkLaptopBagCompatibility(aeroBook14, slimBag14);
    assert.equal(result.compatible, true);
    assert.ok(result.margins_mm);
    assert.ok(result.margins_mm.length_margin_mm >= 0);
    assert.ok(result.margins_mm.width_margin_mm >= 0);
    assert.ok(result.margins_mm.height_margin_mm >= 0);
    assert.equal(result.margins_mm.buffer_applied_mm, 5.0);
  });

  it('6. Oversized laptop fails bag compatibility (DevForge 15 + Slim Bag 14)', () => {
    const result = checkLaptopBagCompatibility(devForge15, slimBag14);
    assert.equal(result.compatible, false);
    assert.ok(result.reason.includes('Dimensional fit failed'));
    assert.ok(result.margins_mm);
    assert.ok(result.margins_mm.length_margin_mm < 0); // 330 - (358 + 5) = -33mm
  });

  it('6b. 14" laptop fails 13" compact sleeve (AeroBook 14 + Tiny Sleeve 13)', () => {
    const result = checkLaptopBagCompatibility(aeroBook14, tinySleeve13);
    assert.equal(result.compatible, false);
    assert.ok(result.margins_mm!.length_margin_mm < 0);
  });

  it('7. Bluetooth mouse passes compatibility on all laptops (AeroBook 14 + Precision M30)', () => {
    const result = checkLaptopMouseCompatibility(aeroBook14, btMouse);
    assert.equal(result.compatible, true);
    assert.equal(result.port_evidence?.mouse_connection_used, 'bluetooth');
    assert.ok(result.reason.includes('Native Bluetooth'));
  });

  it('8. USB-A mouse is rejected when policy says it would consume the only USB-A port (AeroBook 14 has 1 USB-A)', () => {
    const result = checkLaptopMouseCompatibility(aeroBook14, dongleOnlyMouse);
    assert.equal(result.compatible, false);
    assert.equal(result.port_evidence?.policy_enforced, 'EXHAUSTS_SOLE_USB_A_PORT');
    assert.ok(result.reason.includes('exhaust all legacy USB-A ports'));
  });

  it('8b. USB-A mouse is rejected when laptop has 0 USB-A ports (AirLite 13 has 0 USB-A)', () => {
    const result = checkLaptopMouseCompatibility(airLite13, dongleOnlyMouse);
    assert.equal(result.compatible, false);
    assert.equal(result.port_evidence?.policy_enforced, 'ZERO_USB_A_AVAILABLE');
  });

  it('8c. USB-A mouse is accepted when laptop has 2+ USB-A ports (CodeCraft 14 has 2 USB-A)', () => {
    const result = checkLaptopMouseCompatibility(codeCraft14, dongleOnlyMouse);
    assert.equal(result.compatible, true);
    assert.equal(result.port_evidence?.policy_enforced, 'MULTI_USB_A_PORT_ALLOWED');
  });
});
