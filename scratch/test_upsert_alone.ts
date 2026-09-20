import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { initDatabase, getDocById, upsertDoc } from '../src/server/services/db.js';

async function main() {
  await initDatabase();
  const tagId = 'E28011606000020788842D21';

  console.log('--- TESTING UPSERT DOC ---');
  const customProfile = {
    id: tagId,
    tagId: tagId,
    hardhatTagId: tagId,
    name: 'Sesuraja Site Lead',
    firstName: 'Sesuraja',
    lastName: 'Site Lead',
    role: 'Lead Project Safety Manager',
    phone: '+1 (555) 234-5678',
    isCustomProfile: true,
    updatedAt: new Date().toISOString()
  };

  const saved = await upsertDoc('registered_people', customProfile, 'default');
  console.log('upsertDoc returned:', saved?.name, saved?.phone);

  const doc = await getDocById('registered_people', tagId, 'default');
  console.log('getDocById returned:', doc?.name, doc?.phone);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
