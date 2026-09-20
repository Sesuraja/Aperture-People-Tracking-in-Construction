import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  
  const testTagId = 'E28011606000020788842D21';
  const docs = await db.collection('registered_people').find({
    $or: [
      { id: testTagId },
      { tagId: testTagId },
      { hardhatTagId: testTagId },
      { TagID: testTagId }
    ]
  }).toArray();

  console.log(`Found ${docs.length} docs in registered_people:`);
  for (const d of docs) {
    console.log({
      _id: d._id,
      _idType: typeof d._id,
      id: d.id,
      name: d.name,
      role: d.role,
      tagId: d.tagId,
      hardhatTagId: d.hardhatTagId,
      organizationId: d.organizationId
    });
  }

  const peopleDocs = await db.collection('people').find({
    $or: [
      { id: testTagId },
      { tagId: testTagId },
      { hardhatTagId: testTagId },
      { TagID: testTagId }
    ]
  }).toArray();

  console.log(`Found ${peopleDocs.length} docs in people:`);
  for (const d of peopleDocs) {
    console.log({
      _id: d._id,
      _idType: typeof d._id,
      id: d.id,
      name: d.name,
      role: d.role,
      tagId: d.tagId,
      hardhatTagId: d.hardhatTagId,
      organizationId: d.organizationId
    });
  }

  await client.close();
  process.exit(0);
}

main().catch(console.error);
