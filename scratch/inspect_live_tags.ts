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
  console.log('--- live_tags ---');
  const liveDocs = await db.collection('live_tags').find({
    $or: [{ TagID: tagId }, { tagId: tagId }, { id: tagId }]
  }).toArray();
  liveDocs.forEach(d => console.log('  live_tags:', { id: d.id, name: d.name, FirstName: d.FirstName, LastName: d.LastName }));

  console.log('--- real_time_tags ---');
  const rtDocs = await db.collection('real_time_tags').find({
    $or: [{ TagID: tagId }, { tagId: tagId }, { id: tagId }]
  }).toArray();
  rtDocs.forEach(d => console.log('  real_time_tags:', { id: d.id, name: d.name, FirstName: d.FirstName, LastName: d.LastName }));

  await client.close();
}
check().catch(console.error);
