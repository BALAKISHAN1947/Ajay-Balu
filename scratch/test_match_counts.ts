import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { ALL_PRODUCTS } from '../src/data/catalog.ts';

const swiftBook = ALL_PRODUCTS.find(p => p.sku === 'NX-LP-OOS-08');
const alphaBook = ALL_PRODUCTS.find(p => p.sku === 'NX-LP-MINRAMMISS-14');
const edgeBook = ALL_PRODUCTS.find(p => p.sku === 'NX-LP-EDGE14-10');
const basicClick = ALL_PRODUCTS.find(p => p.sku === 'NX-MS-AMBIG-05');

console.log('SwiftBook baseline:', swiftBook?.price, swiftBook?.stock_quantity);
console.log('AlphaBook baseline:', alphaBook?.price, (alphaBook as any)?.ram?.capacity_gb);

// Let's test which benchmark intents target SwiftBook's spec:
// SwiftBook: price 63999, Ryzen 5 7530U, 16GB RAM, 512GB SSD, 14 inch, 1.25kg, in stock when fixed
for (const intent of BENCHMARK_INTENTS) {
  const c = intent.expected_hard_constraints;
  const dec = intent.expected_decision_characteristics;
  const notes = JSON.stringify(dec || {});
  if (notes.includes('NX-LP-OOS-08') || notes.includes('SwiftBook')) {
    console.log(`Explicit SwiftBook Intent: ${intent.benchmark_id}: "${intent.natural_language_query}" (notes: ${notes})`);
  }
  if (notes.includes('NX-LP-MINRAMMISS-14') || notes.includes('AlphaBook')) {
    console.log(`Explicit AlphaBook Intent: ${intent.benchmark_id}: "${intent.natural_language_query}" (notes: ${notes})`);
  }
  if (notes.includes('NX-LP-EDGE14-10') || notes.includes('EdgeBook')) {
    console.log(`Explicit EdgeBook Intent: ${intent.benchmark_id}: "${intent.natural_language_query}" (notes: ${notes})`);
  }
  if (notes.includes('NX-MS-AMBIG-05') || notes.includes('BasicClick')) {
    console.log(`Explicit BasicClick Intent: ${intent.benchmark_id}: "${intent.natural_language_query}" (notes: ${notes})`);
  }
}
