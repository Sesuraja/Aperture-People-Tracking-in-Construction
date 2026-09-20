import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, getDocById } from '../src/server/services/db.js';

async function main() {
  await initDatabase(process.env.MONGODB_URI!);

  const tagId = 'E28011606000020788842D21';
  const r1 = await getDocById('registered_people', tagId, 'default');
  console.log('r1 (org default):', { id: r1?.id, name: r1?.name, role: r1?.role, org: r1?.organizationId });

  const r2 = await getDocById('registered_people', tagId, 'demo');
  console.log('r2 (org demo):', { id: r2?.id, name: r2?.name, role: r2?.role, org: r2?.organizationId });

  const p1 = await getDocById('people', tagId, 'default');
  console.log('p1 (org default):', { id: p1?.id, name: p1?.name, role: p1?.role, org: p1?.organizationId });

  const p2 = await getDocById('people', tagId, 'demo');
  console.log('p2 (org demo):', { id: p2?.id, name: p2?.name, role: p2?.role, org: p2?.organizationId });

  process.exit(0);
}

main().catch(console.error);
