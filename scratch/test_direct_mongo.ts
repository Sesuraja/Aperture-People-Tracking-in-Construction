import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient, ObjectId } from 'mongodb';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  
  const testTagId = 'E28011606000020788842D21';
  const orClauses = [
    { id: testTagId },
    { tagId: testTagId },
    { hardhatTagId: testTagId }
  ];

  const matchFilter = {
    $and: [
      { $or: orClauses },
      {
        $or: [
          { organizationId: { $in: ['default', 'demo', 'org_main', 'org_aperture_default', null, ''] } },
          { organizationId: { $exists: false } }
        ]
      }
    ]
  };

  console.log('Finding matchFilter:', JSON.stringify(matchFilter));
  const found = await db.collection('registered_people').findOne(matchFilter);
  console.log('Found:', found?._id, found?.name);

  if (found) {
    const updateResult = await db.collection('registered_people').updateOne(
      { _id: found._id },
      { $set: { name: 'Sesuraja Master Lead', role: 'Chief EHS Director' } }
    );
    console.log('Update result:', updateResult);
  }

  const checkAfter = await db.collection('registered_people').findOne({ _id: found?._id });
  console.log('Direct findOne after update:', checkAfter?.name);

  await client.close();
  process.exit(0);
}

main().catch(console.error);
