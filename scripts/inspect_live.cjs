const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function inspect() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const tags = await db.collection('live_tags').find({}).toArray();
  console.log('All live_tags:');
  tags.forEach(t => console.log(JSON.stringify({ _id: t._id, id: t.id, TagID: t.TagID, tagId: t.tagId, org: t.organizationId })));
  await client.close();
}
inspect().catch(console.error);
