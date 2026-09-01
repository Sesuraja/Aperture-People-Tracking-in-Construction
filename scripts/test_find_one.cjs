require('dotenv').config();
const { initDatabase, getDocById } = require('../dist/server.cjs');

async function test() {
  console.log('Testing getDocById for map_configurations/metro-tower...');
  const t0 = Date.now();
  const doc = await getDocById('map_configurations', 'metro-tower', 'default');
  console.log('Result in', Date.now() - t0, 'ms:', doc ? { id: doc.id, len: doc.floorplanUrl?.length } : null);
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
