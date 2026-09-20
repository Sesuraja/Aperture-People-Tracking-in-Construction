import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, upsertDoc, getDocById } from '../src/server/services/db.js';

async function main() {
  await initDatabase(process.env.MONGODB_URI!);

  const testTagId = 'E28011606000020788842D21';
  console.log('1. Fetching before update:');
  const before = await getDocById('registered_people', testTagId, 'demo');
  console.log('Before:', { id: before?.id, name: before?.name, role: before?.role });

  console.log('2. Upserting update...');
  const res = await upsertDoc('registered_people', {
    id: testTagId,
    tagId: testTagId,
    hardhatTagId: testTagId,
    name: 'Sesuraja Master Lead',
    role: 'Chief EHS Director',
    tradeCompany: 'Aperture Engineering',
    company: 'Aperture Engineering'
  }, 'demo');
  console.log('upsertDoc returned:', { id: res?.id, name: res?.name });

  console.log('3. Fetching after update:');
  const after = await getDocById('registered_people', testTagId, 'demo');
  console.log('After:', { id: after?.id, name: after?.name, role: after?.role });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
