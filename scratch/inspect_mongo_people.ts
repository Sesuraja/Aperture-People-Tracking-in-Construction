import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  const reg = await db.collection('registered_people').find({
    $or: [{ id: 'E28011606000020788842D21' }, { tagId: 'E28011606000020788842D21' }]
  }).toArray();
  const people = await db.collection('people').find({
    $or: [{ id: 'E28011606000020788842D21' }, { tagId: 'E28011606000020788842D21' }]
  }).toArray();
  console.log('registered_people docs:', JSON.stringify(reg, null, 2));
  console.log('people docs:', JSON.stringify(people, null, 2));
  await client.close();
}
check();
