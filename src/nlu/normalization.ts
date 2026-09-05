import type { ProductCategory } from '../types/catalog.ts';

export interface ParsedBudget {
  amount?: number;
  isHardCeiling: boolean;
  rawExpression: string;
  isZero?: boolean;
  isNegative?: boolean;
}

export interface ParsedRam {
  capacity_gb?: number;
  isHardConstraint: boolean;
  rawExpression: string;
}

export interface ParsedStorage {
  capacity_gb?: number;
  isHardConstraint: boolean;
  rawExpression: string;
}

export interface ParsedGpu {
  model?: string;
  min_vram_gb?: number;
  requiresDedicated: boolean;
  isHardConstraint: boolean;
  rawExpression: string;
}

const WORD_TO_NUMBER: Record<string, number> = {
  'one lakh': 100000,
  '1 lakh': 100000,
  'ninety thousand': 90000,
  'eighty thousand': 80000,
  'seventy thousand': 70000,
  'sixty thousand': 60000,
  'fifty thousand': 50000,
  'forty thousand': 40000,
  'thirty five thousand': 35000,
  'thirty thousand': 30000,
  'twenty five thousand': 25000,
  'twenty thousand': 20000,
  'ten thousand': 10000
};

/**
 * Normalizes GPU requirements from natural language.
 * Examples: "RTX 4060", "4060 GPU", "NVIDIA 4060", "8GB graphics", "dedicated graphics".
 */
export function normalizeGpu(text: string): ParsedGpu | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();

  // Model match: RTX 4060, 4060 GPU, NVIDIA 4060, RTX 3050, etc.
  const rtxMatch = lower.match(/\b(?:nvidia\s+)?(?:geforce\s+)?rtx\s*(\d{4})\b/i);
  const numGpuMatch = lower.match(/\b(\d{4})\s*(?:rtx|gpu)\b/i);
  const nvidiaMatch = lower.match(/\bnvidia\s*(\d{4})\b/i);

  // VRAM match: 8GB graphics, 8GB VRAM, 6GB graphics, 4GB GPU
  const vramMatch = lower.match(/(\d+)\s*(?:gb|gigs|gig)\s*(?:vram|graphics|gpu|video memory)/i);

  // Dedicated graphics phrase
  const dedicatedMatch = /\b(dedicated graphics|discrete gpu|dedicated gpu|discrete graphics)\b/i.test(lower);

  const matchedNum = rtxMatch?.[1] || numGpuMatch?.[1] || nvidiaMatch?.[1];

  if (matchedNum || vramMatch || dedicatedMatch) {
    let model: string | undefined = matchedNum ? `RTX ${matchedNum}` : undefined;
    let vram: number | undefined = vramMatch ? parseInt(vramMatch[1], 10) : undefined;

    if (!vram && model === 'RTX 4060') {
      vram = 8;
    } else if (!vram && model === 'RTX 3050') {
      vram = 4;
    }

    const raw = rtxMatch?.[0] || numGpuMatch?.[0] || nvidiaMatch?.[0] || vramMatch?.[0] || (dedicatedMatch ? 'dedicated graphics' : '');

    return {
      model,
      min_vram_gb: vram,
      requiresDedicated: true,
      isHardConstraint: true,
      rawExpression: raw
    };
  }

  return null;
}

/**
 * Normalizes money and budget expressions from natural language.
 * Examples: "70k", "under seventy thousand", "₹70,000", "around 60k", "under 4000".
 */
export function normalizeBudget(text: string): ParsedBudget | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();

  // 0a. Check explicit negative budget
  const negativeMatch = text.match(/(?:^|[^\w])(?:₹|rs\.?|inr)?\s*-\s*(?:₹|rs\.?|inr)?\s*(\d+)/i) ||
                        text.match(/\b(minus|negative)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i);
  if (negativeMatch) {
    const num = parseInt(negativeMatch[1], 10);
    return {
      amount: -num,
      isHardCeiling: true,
      rawExpression: negativeMatch[0].trim(),
      isNegative: true
    };
  }

  // 0b. Check explicit zero budget
  const zeroMatch = text.match(/(?:^|[^\w])(?:₹|rs\.?|inr)\s*0\b/i) ||
                    text.match(/\b(under|below|for|at|within|budget of)\s*(?:₹|rs\.?|inr)?\s*0\b/i) ||
                    text.match(/\b(?:budget|price|cost)\s*(?:of|is)?\s*(?:₹|rs\.?|inr)?\s*0\b/i) ||
                    text.match(/\bzero\s*(?:rupees|inr|budget)\b/i);
  if (zeroMatch) {
    return {
      amount: 0,
      isHardCeiling: true,
      rawExpression: zeroMatch[0].trim(),
      isZero: true
    };
  }

  const isApproximate = /\b(around|approx|approximately|roughly|about)\b/i.test(lower);
  const isExplicitCeiling = /\b(under|below|less than|max|maximum|at most|budget of|within|up to)\b/i.test(lower);

  // Helper to extract and convert number
  function processNumber(numStr: string, suffix?: string, rawExpr = ''): ParsedBudget | null {
    let num = parseInt(numStr.replace(/,/g, ''), 10);
    if (isNaN(num)) return null;

    if (num <= 0) {
      return {
        amount: num,
        isHardCeiling: true,
        rawExpression: rawExpr.trim(),
        isZero: num === 0,
        isNegative: num < 0
      };
    }

    if (suffix === 'k' || suffix === 'thousand') {
      num = num * 1000;
    } else if (suffix === 'lakh') {
      num = num * 100000;
    } else if (num < 200 && (suffix === 'k' || isExplicitCeiling || isApproximate)) {
      num = num * 1000;
    }

    if (num >= 500) {
      const isHard = isExplicitCeiling || (!isApproximate && !/\baround\b/i.test(rawExpr));
      return {
        amount: num,
        isHardCeiling: !isApproximate && isHard,
        rawExpression: rawExpr.trim()
      };
    }
    return null;
  }

  // 0c. Check explicit stretch budget (e.g. "under ₹70,000 and I can spend ₹72,000 if needed")
  const stretchMatch = lower.match(/(?:can spend|can go up to|can extend to|stretch to|if needed|can afford)\s*(?:up to|to)?\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?/i);
  if (stretchMatch) {
    const res = processNumber(stretchMatch[1], stretchMatch[2]?.toLowerCase(), stretchMatch[0]);
    if (res && res.amount && res.amount > 0) return res;
  }

  // 1. Check word-based forms first (e.g. "under seventy thousand")
  for (const [word, val] of Object.entries(WORD_TO_NUMBER)) {
    if (lower.includes(word)) {
      const matchPos = lower.indexOf(word);
      const preceding = lower.substring(Math.max(0, matchPos - 20), matchPos);
      const isWordHard = /\b(under|below|within|budget of|max|maximum|less than)\b/i.test(preceding);
      return {
        amount: val,
        isHardCeiling: isWordHard || !isApproximate,
        rawExpression: word
      };
    }
  }

  // 2. Look for numbers explicitly preceded by currency symbols (e.g. "₹65,000", "rs. 70000", "inr 50000")
  const currencyMatch = lower.match(/(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?/i);
  if (currencyMatch) {
    const res = processNumber(currencyMatch[1], currencyMatch[2]?.toLowerCase(), currencyMatch[0]);
    if (res) return res;
  }

  // 2b. Look for post-positioned Hinglish/colloquial budget keywords (e.g. "60k ke andar", "30k ke aas paas", "60k tak")
  const postHinglishMatch = lower.match(/(?:₹|rs\.?|inr\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?\s*(?:ke\s*andar|andar|tak|ke\s*under|ke\s*aas\s*paas|aas\s*paas)\b/i);
  if (postHinglishMatch) {
    const isApprox = /aas\s*paas/i.test(postHinglishMatch[0]);
    const res = processNumber(postHinglishMatch[1], postHinglishMatch[2]?.toLowerCase(), postHinglishMatch[0]);
    if (res) {
      res.isHardCeiling = !isApprox;
      return res;
    }
  }

  // 3. Look for numbers explicitly preceded by budget keywords (e.g. "under 70k", "budget of 65000", "under 4000")
  const keywordMatch = lower.match(/\b(under|below|less than|max|maximum|at most|budget of|within|up to|around|approx|about)\s*(?:₹|rs\.?|inr\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*(k|thousand|lakh)?/i);
  if (keywordMatch) {
    const res = processNumber(keywordMatch[2], keywordMatch[3]?.toLowerCase(), keywordMatch[0]);
    if (res) return res;
  }

  // 4. Look for numbers with explicit "k" or "lakh" suffix (e.g. "70k", "50k")
  const kMatch = lower.match(/\b(\d+)\s*(k|lakh)\b/i);
  if (kMatch) {
    // Avoid matching specs like "14k" display or "60hz"
    const preceding = lower.substring(Math.max(0, (kMatch.index ?? 0) - 15), kMatch.index ?? 0);
    if (!/display|screen|resolution/i.test(preceding)) {
      const res = processNumber(kMatch[1], kMatch[2].toLowerCase(), kMatch[0]);
      if (res) return res;
    }
  }

  return null;
}

/**
 * Normalizes RAM capacity requirements from natural language.
 * Examples: "16GB", "16 gigs", "at least 16 GB", "must have 16gb".
 */
export function normalizeRam(text: string): ParsedRam | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();
  const match = lower.match(/(\d+)\s*(?:gb|gigs|gig|g)\s*(?:of\s*)?ram/i) ||
                lower.match(/(?:at least|min|minimum|must have|need)\s*(\d+)\s*(?:gb|gigs|gig)/i) ||
                lower.match(/(\d+)\s*(?:gb|gigs|gig)\b/i);

  if (match) {
    const amount = parseInt(match[1], 10);
    // Only accept realistic RAM tiers (8, 16, 32, 64)
    if ([4, 8, 16, 32, 64].includes(amount)) {
      const context = lower.substring(Math.max(0, (match.index ?? 0) - 25), (match.index ?? 0) + match[0].length + 15);
      const isHard = /\b(must have|at least|min|minimum|strictly|need at least|requirement)\b/i.test(context) ||
                     /\b(\d+)\s*(?:gb|gigs)\s*(?:of\s*)?ram\b/i.test(lower);

      return {
        capacity_gb: amount,
        isHardConstraint: isHard,
        rawExpression: match[0].trim()
      };
    }
  }

  return null;
}

/**
 * Normalizes storage requirements from natural language.
 * Examples: "512GB", "1TB", "at least 512 gigs storage".
 */
export function normalizeStorage(text: string): ParsedStorage | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lower = text.toLowerCase();

  const tbMatch = lower.match(/(\d+)\s*(?:tb|terabyte)/i);
  if (tbMatch) {
    const tbVal = parseInt(tbMatch[1], 10);
    return {
      capacity_gb: tbVal * 1024,
      isHardConstraint: true,
      rawExpression: tbMatch[0].trim()
    };
  }

  const gbMatch = lower.match(/(\d+)\s*(?:gb|gigs|gig)\s*(?:ssd|storage|nvme|drive)/i);
  if (gbMatch) {
    const val = parseInt(gbMatch[1], 10);
    if (val >= 256) {
      return {
        capacity_gb: val,
        isHardConstraint: true,
        rawExpression: gbMatch[0].trim()
      };
    }
  }

  return null;
}

/**
 * Normalizes requested product categories from query.
 */
export function normalizeCategories(text: string): ProductCategory[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const lower = text.toLowerCase();
  const categories: Set<ProductCategory> = new Set();

  // Check for accessory context e.g. "bag for my laptop" or "backpack for laptop"
  const isOnlyBagReference = /\b(bag|backpack|sleeve|case|briefcase)\s+(?:for\s+(?:my\s+|a\s+)?laptop)\b/i.test(lower) &&
                             !/\b(and|plus|\+)\s+(?:a\s+)?laptop\b/i.test(lower) &&
                             !/\bneed\s+a\s+laptop\b/i.test(lower);

  if (!isOnlyBagReference && /\b(laptop|notebook|ultrabook|pc|computer)\b/i.test(lower)) {
    categories.add('laptop');
  }

  if (/\b(mouse|mice|trackpad)\b/i.test(lower)) {
    categories.add('mouse');
  }

  if (/\b(bag|backpack|sleeve|briefcase|case)\b/i.test(lower)) {
    categories.add('bag');
  }

  if (/\b(accessories|bundle|full kit|workspace kit)\b/i.test(lower)) {
    categories.add('mouse');
    categories.add('bag');
  }

  // Default to laptop only if technical laptop hardware specs or computing workloads are present
  if (categories.size === 0 && /\b(ram|ssd|battery life|processor|cpu|coding|programming|developer|software dev|gaming|workstation|python)\b/i.test(lower)) {
    categories.add('laptop');
  }

  return Array.from(categories);
}

export interface CategoryExtractionResult {
  supported: ProductCategory[];
  unsupported: string[];
  rawRequestedCategory?: string;
  isCategorySupported: boolean;
}

/**
 * Extracts and classifies requested categories into supported vs unsupported.
 */
export function extractCategories(text: string): CategoryExtractionResult {
  if (typeof text !== 'string' || !text.trim()) {
    return { supported: [], unsupported: [], isCategorySupported: false };
  }
  const supported = normalizeCategories(text);
  const lower = text.toLowerCase().trim();
  const unsupported: string[] = [];

  const commonUnsupportedPatterns = [
    { pattern: /\b(running shoes|shoes|sneakers|footwear|boots|sandals)\b/i, name: 'running shoes' },
    { pattern: /\b(smartphones?|phones?|mobiles?|iphones?|android phones?)\b/i, name: 'smartphones' },
    { pattern: /\b(mechanical keyboards?|keyboards?)\b/i, name: 'keyboards' },
    { pattern: /\b(monitors?|external displays?|screens?|televisions?|tvs?)\b/i, name: 'monitors' },
    { pattern: /\b(headphones?|earphones?|earbuds?|airpods?|headsets?|speakers?)\b/i, name: 'headphones' },
    { pattern: /\b(tablets?|ipads?|kindles?)\b/i, name: 'tablets' },
    { pattern: /\b(smartwatches?|watches?)\b/i, name: 'smartwatches' },
    { pattern: /\b(cameras?|webcams?|dslrs?)\b/i, name: 'cameras' },
    { pattern: /\b(printers?|scanners?)\b/i, name: 'printers' },
    { pattern: /\b(office chairs?|chairs?|desks?|standing desks?|furniture)\b/i, name: 'workspace furniture' },
    { pattern: /\b(clothes?|clothing|shirts?|t-shirts?|pants?|jeans?|jackets?|dresses?)\b/i, name: 'apparel' },
    { pattern: /\b(coffee makers?|coffee machines?|mugs?)\b/i, name: 'coffee appliances' },
    { pattern: /\b(books?|novels?|textbooks?)\b/i, name: 'books' }
  ];

  for (const item of commonUnsupportedPatterns) {
    if (item.pattern.test(lower)) {
      unsupported.push(item.name);
    }
  }

  // Generic entity pattern when no known category matched
  if (supported.length === 0 && unsupported.length === 0) {
    const genericMatch = lower.match(
      /(?:need|want|looking for|show me|buy|have|search for|recommend|interested in)\s+(?:a\s+|an\s+|some\s+)?([a-z\s]+?)(?:\s+(?:under|below|less than|around|with|for|in|at)\b|\s*$|[.?!])/i
    );
    if (genericMatch) {
      const candidate = genericMatch[1].trim();
      const nonProductWords = [
        'laptop', 'pc', 'computer', 'machine', 'something', 'anything',
        'device', 'gear', 'item', 'one', 'good', 'cheap', 'best', 'durable', 'options',
        'college', 'student', 'school', 'study', 'python', 'coding', 'gaming'
      ];
      const words = candidate.split(/\s+/);
      const isAllNonProduct = words.every((w) => nonProductWords.includes(w));
      if (candidate.length > 2 && !nonProductWords.includes(candidate) && !isAllNonProduct && !words.includes('something') && !words.includes('anything')) {
        unsupported.push(candidate);
      }
    }
  }

  const isCategorySupported = supported.length > 0 && unsupported.length === 0;

  return {
    supported,
    unsupported,
    rawRequestedCategory: unsupported[0] ?? (supported[0] ? supported[0] : undefined),
    isCategorySupported
  };
}
