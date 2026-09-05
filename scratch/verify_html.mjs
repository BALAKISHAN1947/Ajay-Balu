import http from 'node:http';

const data = await new Promise((resolve, reject) => {
  let buf = '';
  http.get('http://localhost:3000/', res => {
    res.on('data', d => buf += d);
    res.on('end', () => resolve(buf));
    res.on('error', reject);
  });
});

const checks = {
  'customer-view present': data.includes('id="customer-view"'),
  'merchant-view present': data.includes('id="merchant-view"'),
  'benchmark-status-banner present': data.includes('id="benchmark-status-banner"'),
  'tally-won present': data.includes('id="tally-won"'),
  'run-benchmark-btn present': data.includes('id="run-benchmark-btn"'),
  'drilldown-modal present': data.includes('id="drilldown-modal"'),
  'close-drilldown-btn present': data.includes('id="close-drilldown-btn"'),
  'drilldown-body present': data.includes('id="drilldown-body"'),
  'action-loop-console present': data.includes('action-loop-console'),
  'intents-table-body present': data.includes('id="intents-table-body"'),
  'fixes-container present': data.includes('id="fixes-container"'),
  'experiment-results-wrap present': data.includes('id="experiment-results-wrap"'),
};

const merchantViewCount = (data.match(/id="merchant-view"/g) || []).length;
const drilldownCount = (data.match(/id="drilldown-modal"/g) || []).length;
const benchmarkBannerCount = (data.match(/id="benchmark-status-banner"/g) || []).length;

console.log('\n=== HTML Structure Checks ===');
for (const [k, v] of Object.entries(checks)) {
  console.log(`${v ? '✅' : '❌'} ${k}`);
}
console.log(`\n=== Duplicate ID Checks ===`);
console.log(`merchant-view instances: ${merchantViewCount} ${merchantViewCount === 1 ? '✅' : '❌ DUPLICATE'}`);
console.log(`drilldown-modal instances: ${drilldownCount} ${drilldownCount === 1 ? '✅' : '❌ DUPLICATE'}`);
console.log(`benchmark-status-banner instances: ${benchmarkBannerCount} ${benchmarkBannerCount === 1 ? '✅' : '❌ DUPLICATE'}`);
