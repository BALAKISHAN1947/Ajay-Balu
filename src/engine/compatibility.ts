import type { LaptopProduct, BagProduct, MouseProduct, Product } from '../types/catalog.ts';
import type { CompatibilityResult, DimensionMargins } from '../types/compatibility.ts';
import type { CustomerIntent } from '../types/intent.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';

/**
 * Standard dimensional buffer applied to each axis (length, width, height)
 * in millimeters to ensure smooth insertion and seam clearance.
 */
export const REQUIRED_BAG_BUFFER_MM = 5.0;

/**
 * Checks physical dimensional compatibility between a laptop and a laptop bag/sleeve.
 */
export function checkLaptopBagCompatibility(
  laptop: LaptopProduct,
  bag: BagProduct
): CompatibilityResult {
  const maxDims = bag.laptop_compartment_max_dimensions_mm;
  const buffer = REQUIRED_BAG_BUFFER_MM;

  const effectiveLength = laptop.dimensions_mm.length + buffer;
  const effectiveWidth = laptop.dimensions_mm.width + buffer;
  const effectiveHeight = laptop.dimensions_mm.height + buffer;

  const lengthMargin = Number((maxDims.max_length - effectiveLength).toFixed(1));
  const widthMargin = Number((maxDims.max_width - effectiveWidth).toFixed(1));
  const heightMargin = Number((maxDims.max_height - effectiveHeight).toFixed(1));

  const margins: DimensionMargins = {
    length_margin_mm: lengthMargin,
    width_margin_mm: widthMargin,
    height_margin_mm: heightMargin,
    buffer_applied_mm: buffer
  };

  const failedAxes: string[] = [];
  if (lengthMargin < 0) failedAxes.push(`Length (laptop: ${laptop.dimensions_mm.length}mm + ${buffer}mm buffer > bag max: ${maxDims.max_length}mm)`);
  if (widthMargin < 0) failedAxes.push(`Width (laptop: ${laptop.dimensions_mm.width}mm + ${buffer}mm buffer > bag max: ${maxDims.max_width}mm)`);
  if (heightMargin < 0) failedAxes.push(`Height (laptop: ${laptop.dimensions_mm.height}mm + ${buffer}mm buffer > bag max: ${maxDims.max_height}mm)`);

  if (failedAxes.length > 0) {
    return {
      compatible: false,
      primary_sku: laptop.sku,
      accessory_sku: bag.sku,
      accessory_category: 'bag',
      reason: `Dimensional fit failed: ${failedAxes.join(', ')}.`,
      margins_mm: margins
    };
  }

  return {
    compatible: true,
    primary_sku: laptop.sku,
    accessory_sku: bag.sku,
    accessory_category: 'bag',
    reason: `Verified dimensional fit: Laptop (${laptop.dimensions_mm.length}x${laptop.dimensions_mm.width}x${laptop.dimensions_mm.height}mm) fits comfortably in ${bag.name} compartment with ${buffer}mm clearance on all axes.`,
    margins_mm: margins
  };
}

/**
 * Checks interface protocol compatibility between a laptop and a mouse,
 * enforcing port reservation policies.
 */
export function checkLaptopMouseCompatibility(
  laptop: LaptopProduct,
  mouse: MouseProduct,
  intent?: CustomerIntent
): CompatibilityResult {
  const preferBluetooth = intent?.soft_preferences?.prefer_bluetooth_mouse;

  // Case 1: Customer explicitly requested Bluetooth, but mouse lacks Bluetooth
  if (preferBluetooth && !mouse.bluetooth) {
    return {
      compatible: false,
      primary_sku: laptop.sku,
      accessory_sku: mouse.sku,
      accessory_category: 'mouse',
      reason: `Customer requested Bluetooth connectivity; ${mouse.name} requires a 2.4GHz USB dongle and does not support Bluetooth.`,
      port_evidence: {
        laptop_usb_a_count: laptop.ports.usb_a_count,
        mouse_connection_used: 'none',
        policy_enforced: 'PREFER_BLUETOOTH_REQUESTED'
      }
    };
  }

  // Case 2: Mouse has native Bluetooth
  if (mouse.bluetooth) {
    return {
      compatible: true,
      primary_sku: laptop.sku,
      accessory_sku: mouse.sku,
      accessory_category: 'mouse',
      reason: `Native Bluetooth compatibility verified: Connects directly via Bluetooth ${mouse.bluetooth_version ?? '5.x'}, leaving all ${laptop.ports.usb_a_count} USB-A and ${laptop.ports.usb_c_count} USB-C ports available.`,
      port_evidence: {
        laptop_usb_a_count: laptop.ports.usb_a_count,
        mouse_connection_used: 'bluetooth',
        policy_enforced: 'NATIVE_BLUETOOTH_PASSED'
      }
    };
  }

  // Case 3: Mouse is dongle-only (No Bluetooth)
  if (mouse.wireless_2_4ghz_dongle) {
    // Check if laptop has 0 USB-A ports
    if (laptop.ports.usb_a_count === 0) {
      return {
        compatible: false,
        primary_sku: laptop.sku,
        accessory_sku: mouse.sku,
        accessory_category: 'mouse',
        reason: `Physical port mismatch: ${mouse.name} requires a USB-A port for its 2.4GHz dongle, but ${laptop.name} has 0 USB-A ports.`,
        port_evidence: {
          laptop_usb_a_count: 0,
          mouse_connection_used: 'usb_a_dongle',
          policy_enforced: 'ZERO_USB_A_AVAILABLE'
        }
      };
    }

    // Check single USB-A port exhaustion policy
    if (laptop.ports.usb_a_count === 1) {
      return {
        compatible: false,
        primary_sku: laptop.sku,
        accessory_sku: mouse.sku,
        accessory_category: 'mouse',
        reason: `Port reservation policy: ${laptop.name} has only 1 USB-A port. Connecting a 2.4GHz dongle would exhaust all legacy USB-A ports on the laptop. A Bluetooth mouse is required.`,
        port_evidence: {
          laptop_usb_a_count: 1,
          mouse_connection_used: 'usb_a_dongle',
          policy_enforced: 'EXHAUSTS_SOLE_USB_A_PORT'
        }
      };
    }

    // Laptop has 2+ USB-A ports
    return {
      compatible: true,
      primary_sku: laptop.sku,
      accessory_sku: mouse.sku,
      accessory_category: 'mouse',
      reason: `USB-A dongle compatibility verified: Laptop has ${laptop.ports.usb_a_count} USB-A ports; dongle consumes 1 port, leaving ${laptop.ports.usb_a_count - 1} free USB-A port(s).`,
      port_evidence: {
        laptop_usb_a_count: laptop.ports.usb_a_count,
        mouse_connection_used: 'usb_a_dongle',
        policy_enforced: 'MULTI_USB_A_PORT_ALLOWED'
      }
    };
  }

  // Fallback
  return {
    compatible: false,
    primary_sku: laptop.sku,
    accessory_sku: mouse.sku,
    accessory_category: 'mouse',
    reason: `Incomplete connectivity profile for mouse ${mouse.name}.`,
    port_evidence: {
      laptop_usb_a_count: laptop.ports.usb_a_count,
      mouse_connection_used: 'none',
      policy_enforced: 'MISSING_SPEC'
    }
  };
}

/**
 * Universal compatibility checker function.
 */
export function checkCompatibility(
  primarySku: string,
  accessorySku: string,
  repo: ICatalogRepository = getCatalogRepository(),
  intent?: CustomerIntent
): CompatibilityResult {
  const primary = repo.getProductBySku(primarySku);
  const accessory = repo.getProductBySku(accessorySku);

  if (!primary || primary.category !== 'laptop') {
    throw new Error(`Primary product ${primarySku} is not a valid laptop.`);
  }

  if (!accessory) {
    throw new Error(`Accessory product ${accessorySku} not found.`);
  }

  const laptop = primary as LaptopProduct;

  if (accessory.category === 'bag') {
    return checkLaptopBagCompatibility(laptop, accessory as BagProduct);
  }

  if (accessory.category === 'mouse') {
    return checkLaptopMouseCompatibility(laptop, accessory as MouseProduct, intent);
  }

  throw new Error(`Unsupported accessory category: ${accessory.category}`);
}
