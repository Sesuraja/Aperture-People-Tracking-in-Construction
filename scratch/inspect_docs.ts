import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch {}
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('No MONGODB_URI');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  
  const tagId = 'E28011606000020788842D21';
  console.log('--- registered_people ---');
  const regDocs = await db.collection('registered_people').find({
    $or: [{ id: tagId }, { tagId: tagId }, { hardhatTagId: tagId }, { TagID: tagId }]
  }).toArray();
  console.log(`Found ${regDocs.length} in registered_people:`);
  regDocs.forEach(d => console.log('  _id:', d._id, 'id:', d.id, 'name:', d.name, 'updatedAt:', d.updatedAt));

  console.log('--- people ---');
  const peopleDocs = await db.collection('people').find({
    $or: [{ id: tagId }, { tagId: tagId }, { hardhatTagId: tagId }, { TagID: tagId }]
  }).toArray();
  console.log(`Found ${peopleDocs.length} in people:`);
  peopleDocs.forEach(d => console.log('  _id:', d._id, 'id:', d.id, 'name:', d.name, 'updatedAt:', d.updatedAt));

  await client.close();
}
check().catch(console.error);
