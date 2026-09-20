import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  const users = await db.collection('users').find({}).toArray();
  console.log('Users in DB count:', users.length);
  for (const u of users) {
    console.log({ id: u.id, email: u.email, role: u.role, org: u.organizationId });
  }
  await client.close();
}
run().catch(console.error);
