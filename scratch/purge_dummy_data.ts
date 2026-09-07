import dotenv from 'dotenv';
dotenv.config();
import { initDatabase, purgeAllDemoAndTestData, getCollectionDocs } from '../src/server/services/db.js';
import { syncPeopleTrackingData } from '../src/server/services/peopleTrackingApiService.js';

async function main() {
  await initDatabase();
  console.log('Connected to MongoDB.');

  const purgeResult = await purgeAllDemoAndTestData();
  console.log('Purged test data result:', JSON.stringify(purgeResult, null, 2));

  // Trigger real sync from live API
  console.log('Triggering syncPeopleTrackingData from live API...');
  const syncResult = await syncPeopleTrackingData();
  console.log('Sync result:', syncResult);

  // Check counts in key collections
  const collections = [
    'history_records',
    'tag_history',
    'registered_people',
    'people',
    'devices',
    'hardware_readers',
    'zones',
    'attendance_logs',
    'live_tags',
    'real_time_tags',
    'ai_insights',
    'alerts',
    'incidents'
  ];

  console.log('\n--- Current MongoDB Collection Counts ---');
  for (const col of collections) {
    const docs = await getCollectionDocs(col, undefined, 'ALL');
    console.log(`${col}: ${docs.length} records`);
    if (docs.length > 0 && docs.length <= 3) {
      console.log(`  Sample:`, docs.map((d: any) => ({ id: d.id, name: d.name || d.FirstName, tagId: d.TagID || d.tagId, loc: d.Location || d.LocationName || d.location })));
    } else if (docs.length > 3) {
      console.log(`  Sample (first 2):`, docs.slice(0, 2).map((d: any) => ({ id: d.id, name: d.name || d.FirstName, tagId: d.TagID || d.tagId, loc: d.Location || d.LocationName || d.location })));
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
