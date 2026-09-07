const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function runPurge() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB Atlas. Executing full purge of demo/test/dummy data...');

  const fakeIds = [
    'TAG_123', 'W-101', 'worker-1', 'worker-2', 'worker-3',
    'TEST_AUTH_CHECK', 'TEST_DEVICE_INGEST',
    'UHF-REAL-001', 'UHF-REAL-002', 'TAG_API_WORKER_99',
    'BATCH-001', 'BATCH-002',
    'TEST_WS_TAG_991', 'TEST_MQTT_TAG_992', 'TEST_BULK_TAG_993',
    'TAG_DIAG_WS_MQTT', 'DIAG_MQTT_PING_01',
    'TAG_HAZARD_01', 'TAG_SAFE_02'
  ];

  const fakeTagRegex = /^(TEST_|BATCH-|UHF-REAL-|TAG_DIAG|DIAG_|TAG_HIST_|TAG_RT_|TAG_RAW_|TAG_API_|TAG_HAZARD_|TAG_SAFE_)/i;
  const fakeOrgRegex = /^(safety_org_|ai_workflow_org_|test_|demo$)/i;
  const fakeNames = [
    'Staff User', 'John Miller', 'Marcus Vance', 'Alice Smith',
    'Sarah Jenkins', 'David Wilson', 'WebSocket Tester', 'MQTT Tester'
  ];

  const tagFilter = {
    $or: [
      { id: { $in: fakeIds } },
      { _id: { $in: fakeIds } },
      { tagId: { $in: fakeIds } },
      { TagID: { $in: fakeIds } },
      { hardhatTagId: { $in: fakeIds } },
      { id: { $regex: fakeTagRegex } },
      { tagId: { $regex: fakeTagRegex } },
      { TagID: { $regex: fakeTagRegex } },
      { hardhatTagId: { $regex: fakeTagRegex } },
      { organizationId: { $regex: fakeOrgRegex } },
      { organizationId: 'demo' },
      { name: { $in: fakeNames } },
      { personName: { $in: fakeNames } }
    ]
  };

  const trackingCols = [
    'people', 'registered_people', 'attendance_logs',
    'real_time_tags', 'live_tags', 'tag_history',
    'rfid_realtime_events', 'devices'
  ];

  for (const col of trackingCols) {
    const res = await db.collection(col).deleteMany(tagFilter);
    console.log(` - ${col} deleted via tagFilter: ${res.deletedCount}`);
  }

  // Strictly enforce that live_tags and real_time_tags ONLY contain real API tags
  const exactFakeIds = ['UHF-REAL-001', 'UHF-REAL-002', 'BATCH-001', 'BATCH-002', 'TAG_API_WORKER_99', 'TEST_WS_TAG_991', 'TEST_MQTT_TAG_992', 'TEST_BULK_TAG_993', 'TAG_DIAG_WS_MQTT'];
  const fakeDel = {
    $or: [
      { id: { $in: exactFakeIds } },
      { TagID: { $in: exactFakeIds } },
      { tagId: { $in: exactFakeIds } }
    ]
  };
  const liveDel = await db.collection('live_tags').deleteMany(fakeDel);
  const rtDel = await db.collection('real_time_tags').deleteMany(fakeDel);
  console.log(` - live_tags exact fake cleaned: ${liveDel.deletedCount}`);
  console.log(` - real_time_tags exact fake cleaned: ${rtDel.deletedCount}`);

  const incidentAndAlertFilter = {
    $or: [
      { tagId: { $in: fakeIds } },
      { tagId: { $regex: fakeTagRegex } },
      { TagID: { $in: fakeIds } },
      { TagID: { $regex: fakeTagRegex } },
      { organizationId: { $regex: fakeOrgRegex } },
      { organizationId: 'demo' },
      { personName: { $in: fakeNames } }
    ]
  };

  const aiCols = ['alerts', 'alerts_enterprise', 'incidents', 'incidents_enterprise', 'ai_insights', 'ai_recommendations'];
  for (const col of aiCols) {
    const res = await db.collection(col).deleteMany(incidentAndAlertFilter);
    console.log(` - ${col} deleted: ${res.deletedCount}`);
  }

  const playbackRes = await db.collection('playback_history').deleteMany({
    $or: [
      { 'tags.tagId': { $in: fakeIds } },
      { 'tags.TagID': { $in: fakeIds } },
      { 'tags.tagId': { $regex: fakeTagRegex } },
      { 'tags.TagID': { $regex: fakeTagRegex } },
      { organizationId: { $regex: fakeOrgRegex } },
      { organizationId: 'demo' }
    ]
  });
  console.log(` - playback_history deleted: ${playbackRes.deletedCount}`);

  const orgRes = await db.collection('organizations').deleteMany({
    $or: [
      { id: { $regex: fakeOrgRegex } },
      { id: 'demo' },
      { organizationId: 'demo' }
    ]
  });
  console.log(` - organizations deleted: ${orgRes.deletedCount}`);

  const userRes = await db.collection('users').deleteMany({
    $or: [
      { id: { $in: ['usr_viewer', 'usr_admin', 'demo_user'] } },
      { email: { $in: ['viewer@example.com', 'admin@gaostaff.com', 'demo@aperture.io', 'forged_admin@gaostaff.com'] } },
      { organizationId: { $regex: fakeOrgRegex } },
      { organizationId: 'demo' }
    ]
  });
  console.log(` - users deleted: ${userRes.deletedCount}`);

  const thirdPartyRes = await db.collection('third_party_apis').deleteMany({
    $or: [
      { id: 'failing_api_conn' },
      { endpointUrl: /localhost:59999/i },
      { name: /Non Existent/i }
    ]
  });
  console.log(` - third_party_apis deleted: ${thirdPartyRes.deletedCount}`);

  // Clean test names without targeting any specific tag ID
  await db.collection('people').updateMany(
    { lastName: 'Doe Testing' },
    { $set: { lastName: '', name: 'John' } }
  );
  await db.collection('registered_people').updateMany(
    { lastName: 'Doe Testing' },
    { $set: { lastName: '', name: 'John' } }
  );
  await db.collection('incidents').updateMany(
    { personName: 'John Doe Testing' },
    { $set: { personName: 'John' } }
  );
  await db.collection('alerts').updateMany(
    { personName: 'John Doe Testing' },
    { $set: { personName: 'John' } }
  );

  // Inspect remaining distinct tags in tracking collections
  console.log('\n--- VERIFYING REMAINING DATA IN DATABASE ---');
  for (const col of ['people', 'registered_people', 'live_tags', 'real_time_tags', 'tag_history', 'history_records']) {
    const distinctTags = await db.collection(col).distinct('tagId');
    const distinctTagID = await db.collection(col).distinct('TagID');
    const allDistinct = Array.from(new Set([...distinctTags, ...distinctTagID])).filter(Boolean);
    const count = await db.collection(col).countDocuments();
    console.log(`Collection ${col}: ${count} total docs, Distinct TagIDs:`, allDistinct);
  }

  await client.close();
  console.log('\nPurge and verification completed successfully!');
}

runPurge().catch(console.error);
