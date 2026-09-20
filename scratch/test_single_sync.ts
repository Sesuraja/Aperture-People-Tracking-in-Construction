import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { initDatabase, getDocById, upsertDoc } from '../src/server/services/db.js';
import { syncPeopleTrackingData } from '../src/server/services/peopleTrackingApiService.js';

async function main() {
  await initDatabase();
  const tagId = 'E28011606000020788842D21';

  console.log('1. Upserting custom profile...');
  const customProfile = {
    id: tagId,
    tagId: tagId,
    hardhatTagId: tagId,
    name: 'Sesuraja Site Lead',
    role: 'Lead Project Safety Manager',
    phone: '+1 (555) 234-5678',
    isCustomProfile: true,
    updatedAt: new Date().toISOString()
  };
  await upsertDoc('registered_people', customProfile, 'default');
  await upsertDoc('people', customProfile, 'default');

  const before = await getDocById('registered_people', tagId, 'default');
  console.log('Before sync doc name:', before?.name, 'phone:', before?.phone, 'isCustomProfile:', before?.isCustomProfile);

  console.log('2. Running autoSyncTelemetryToMongoDB once...');
  const { autoSyncTelemetryToMongoDB } = await import('../src/server/services/peopleTrackingApiService.js');
  await autoSyncTelemetryToMongoDB([{
    TagID: tagId,
    tagId: tagId,
    Location: 'Zone1',
    EnterTime: new Date().toISOString(),
    FirstName: 'John',
    LastName: '',
    fullName: 'John'
  }], 'default');

  const afterAutoSync = await getDocById('registered_people', tagId, 'default');
  console.log('After autoSync doc name:', afterAutoSync?.name, 'phone:', afterAutoSync?.phone, 'isCustomProfile:', afterAutoSync?.isCustomProfile);

  console.log('3. Running processTelemetryWithAI once...');
  const { processTelemetryWithAI } = await import('../src/server/services/aiPipeline.js');
  await processTelemetryWithAI([{
    TagID: tagId,
    tagId: tagId,
    Location: 'Zone1',
    EnterTime: new Date().toISOString(),
    FirstName: 'John',
    LastName: '',
    personName: 'John',
    source: 'i360_realtime_api',
    orgId: 'default'
  }], 'test', 'default');

  const afterAi = await getDocById('registered_people', tagId, 'default');
  console.log('After AI doc name:', afterAi?.name, 'phone:', afterAi?.phone, 'isCustomProfile:', afterAi?.isCustomProfile);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
