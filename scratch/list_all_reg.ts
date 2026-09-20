import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  const reg = await db.collection('registered_people').find({}).toArray();
  console.log('--- ALL REGISTERED PEOPLE --- (count: ' + reg.length + ')');
  for (const doc of reg) {
    console.log(JSON.stringify({
      _id: doc._id,
      id: doc.id,
      tagId: doc.tagId,
      hardhatTagId: doc.hardhatTagId,
      name: doc.name,
      firstName: doc.firstName,
      lastName: doc.lastName,
      phone: doc.phone,
      isCustomProfile: doc.isCustomProfile,
      org: doc.organizationId
    }));
  }
  const ppl = await db.collection('people').find({}).toArray();
  console.log('--- ALL PEOPLE --- (count: ' + ppl.length + ')');
  for (const doc of ppl) {
    console.log(JSON.stringify({
      _id: doc._id,
      id: doc.id,
      tagId: doc.tagId,
      hardhatTagId: doc.hardhatTagId,
      name: doc.name,
      firstName: doc.firstName,
      lastName: doc.lastName,
      phone: doc.phone,
      isCustomProfile: doc.isCustomProfile,
      org: doc.organizationId
    }));
  }
  await client.close();
}

run().catch(console.error);
