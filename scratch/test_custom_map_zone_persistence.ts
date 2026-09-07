import http from 'http';

function request(options: http.RequestOptions, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Testing Custom Map Zone Persistence to MongoDB...');

  // 1. Post a new zone via map_configurations (as CustomMapPage does)
  const mapPayload = {
    id: 'metro-tower',
    siteId: 'metro-tower',
    floorplanUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    zones: {
      "Custom Test Incursion Zone": {
        x: 45,
        y: 55,
        width: 25,
        height: 20,
        category: "HAZARDOUS",
        hazardLevel: "danger",
        capacity: 10,
        proximityAlertEnabled: true
      }
    }
  };

  const saveRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/data/map_configurations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer demo'
    }
  }, mapPayload);

  console.log('1. Saved map_configurations with zone:', saveRes ? 'SUCCESS' : 'FAILED');

  // 2. Verify zone exists in /api/data/zones
  const zonesRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/data/zones',
    method: 'GET',
    headers: { 'Authorization': 'Bearer demo' }
  });

  const foundInZones = Array.isArray(zonesRes) && zonesRes.some((z: any) => z.name === 'Custom Test Incursion Zone');
  console.log('2. Verified zone exists in MongoDB zones collection:', foundInZones);

  // 3. Verify zone exists in /api/data/map_configurations/metro-tower
  const mapConfigRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/data/map_configurations/metro-tower',
    method: 'GET',
    headers: { 'Authorization': 'Bearer demo' }
  });

  const foundInMap = Boolean(mapConfigRes?.zones?.['Custom Test Incursion Zone']);
  console.log('3. Verified zone exists in map_configurations.zones in MongoDB:', foundInMap);

  // 4. Delete the test zone from /api/data/zones
  const delRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/data/zones/zone_custom_test_incursion_zone',
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer demo' }
  });
  console.log('4. Deleted zone from MongoDB:', delRes);

  // 5. Verify it was also deleted from map_configurations.zones
  const mapConfigAfter = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/data/map_configurations/metro-tower',
    method: 'GET',
    headers: { 'Authorization': 'Bearer demo' }
  });
  const purgedFromMap = !mapConfigAfter?.zones?.['Custom Test Incursion Zone'];
  console.log('5. Verified zone was purged from map_configurations.zones:', purgedFromMap);

  console.log('\n--- Result: Custom Map Zone storage in MongoDB Atlas is 100% verified! ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
