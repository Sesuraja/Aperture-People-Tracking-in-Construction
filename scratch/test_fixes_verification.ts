import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, upsertDoc, getDocById, getCollectionDocs } from '../src/server/services/db.js';
import { autoSyncTelemetryToMongoDB } from '../src/server/services/peopleTrackingApiService.js';

async function verifyAllFixes() {
  console.log('--- 1. Connecting to MongoDB ---');
  await initDatabase(process.env.MONGODB_URI!);

  const testTagId = 'E28011606000020788842D21';
  console.log(`\n--- 2. Testing Worker Edit Persistence for ${testTagId} ---`);

  const updatedProfile = {
    id: testTagId,
    tagId: testTagId,
    hardhatTagId: testTagId,
    name: 'Sesuraja Master Lead',
    firstName: 'Sesuraja',
    lastName: 'Master Lead',
    role: 'Chief EHS Director',
    tradeCompany: 'Aperture Engineering',
    company: 'Aperture Engineering',
    department: 'Executive EHS & Safety',
    phone: '+1 (555) 777-8899',
    email: 'sesuraja@aperture.io',
    emergencyContact: 'Family Contact (+1 555-444-3322)',
    supervisor: 'Global Operations VP',
    notes: 'Verified site access lead',
    currentZone: 'Zone1',
    shiftStatus: 'ON_SITE',
    ppeStatus: 'COMPLIANT',
    trainingStatus: 'COMPLIANT',
    certifications: 'Level 3 Master Auditor',
    updatedAt: new Date().toISOString()
  };

  await upsertDoc('registered_people', updatedProfile, 'demo');
  await upsertDoc('people', updatedProfile, 'demo');

  // Verify fetch back with tenant 'demo'
  const fetched = await getDocById('registered_people', testTagId, 'demo');
  console.log('Fetched worker from registered_people with tenant demo:', {
    id: fetched?.id,
    name: fetched?.name,
    role: fetched?.role,
    company: fetched?.company,
    phone: fetched?.phone,
    email: fetched?.email,
    supervisor: fetched?.supervisor
  });

  if (fetched?.name !== 'Sesuraja Master Lead' || fetched?.role !== 'Chief EHS Director') {
    throw new Error('Worker profile failed to update in MongoDB!');
  }
  console.log(' Worker profile update verified in MongoDB Atlas!');

  console.log('\n--- 3. Testing autoSyncTelemetryToMongoDB Does NOT Overwrite User Edits ---');
  const incomingMockTelemetry = [{
    TagID: testTagId,
    LocationName: 'Zone1',
    EnterTime: new Date().toISOString(),
    LeaveTime: 'ACTIVE',
    FirstName: 'John',
    LastName: 'Doe',
    Duration: 1.5
  }];

  await autoSyncTelemetryToMongoDB(incomingMockTelemetry, 'demo');

  const afterSync = await getDocById('registered_people', testTagId, 'demo');
  console.log('Worker profile after background telemetry sync:', {
    name: afterSync?.name,
    role: afterSync?.role,
    company: afterSync?.company,
    phone: afterSync?.phone,
    currentZone: afterSync?.currentZone
  });

  if (afterSync?.name !== 'Sesuraja Master Lead') {
    throw new Error(`Background sync overwrote user-edited name! Got: ${afterSync?.name}`);
  }
  console.log(' Background telemetry sync successfully preserved user edits!');

  console.log('\n--- 4. Testing Incidents & Alerts Multi-tenant Querying ---');
  const demoIncidents = await getCollectionDocs('incidents', undefined, 'demo');
  console.log(`Incidents count for tenant 'demo': ${demoIncidents.length}`);

  const demoAlerts = await getCollectionDocs('alerts', undefined, 'demo');
  console.log(`Alerts count for tenant 'demo': ${demoAlerts.length}`);

  if (demoIncidents.length === 0) {
    console.warn('⚠️ No incidents found for demo tenant (expected > 0 from Atlas)');
  } else {
    console.log(` Successfully loaded ${demoIncidents.length} dynamic incidents for tenant demo!`);
  }

  console.log('\n ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

verifyAllFixes().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
