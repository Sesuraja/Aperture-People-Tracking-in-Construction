const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const uri = 'mongodb://Sigmund:Jesuraja123@ac-vtqk6ag-shard-00-00.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-01.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-02.lxd6qba.mongodb.net:27017/Lat-Aperture-People-Tracking?ssl=true&authSource=admin&replicaSet=atlas-p6339k-shard-0';

async function run() {
  const filePath = path.join(process.cwd(), 'public', 'uploads', 'floorplans', 'floorplan_b2f0f225a9cc.png');
  const buffer = fs.readFileSync(filePath);
  const base64Data = 'data:image/png;base64,' + buffer.toString('base64');
  console.log('Image data length:', base64Data.length);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');

  // Save directly to MongoDB Atlas in map_configurations and floorplans
  await db.collection('map_configurations').updateOne(
    { id: 'metro-tower' },
    { 
      $set: { 
        id: 'metro-tower',
        siteId: 'metro-tower',
        organizationId: 'default',
        floorplanUrl: base64Data,
        floorplanData: base64Data,
        updatedAt: new Date().toISOString()
      } 
    },
    { upsert: true }
  );

  await db.collection('floorplans').updateOne(
    { id: 'fp_metro-tower' },
    {
      $set: {
        id: 'fp_metro-tower',
        siteId: 'metro-tower',
        organizationId: 'default',
        url: base64Data,
        floorplanData: base64Data,
        updatedAt: new Date().toISOString()
      }
    },
    { upsert: true }
  );

  console.log('Successfully saved image map directly into MongoDB Atlas!');
  await client.close();
}

run().catch(console.error);
