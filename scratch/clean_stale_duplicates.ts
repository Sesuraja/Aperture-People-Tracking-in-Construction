import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');

  // Normalize all existing people to 'default' organizationId and remove split-brain duplicates
  const delRes = await db.collection('people').deleteMany({
    organizationId: 'org_aperture_default'
  });
  console.log(`Deleted stale org_aperture_default duplicates in people: ${delRes.deletedCount}`);

  await client.close();
  process.exit(0);
}

main().catch(console.error);
