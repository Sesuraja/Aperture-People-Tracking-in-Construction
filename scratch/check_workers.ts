import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db();
  const docs = await db.collection('registered_people').find({}).toArray();
  console.log('Registered people count:', docs.length);
  console.log('Docs:', JSON.stringify(docs.map(d => ({
    _id: d._id,
    id: d.id,
    name: d.name,
    tagId: d.tagId,
    hardhatTagId: d.hardhatTagId,
    organizationId: d.organizationId
  })), null, 2));
  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
