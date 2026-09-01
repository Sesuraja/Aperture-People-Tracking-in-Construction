const { MongoClient } = require('mongodb');

const uri = 'mongodb://Sigmund:Jesuraja123@ac-vtqk6ag-shard-00-00.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-01.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-02.lxd6qba.mongodb.net:27017/Lat-Aperture-People-Tracking?ssl=true&authSource=admin&replicaSet=atlas-p6339k-shard-0';

async function test() {
  console.log('Connecting to MongoDB Atlas directly...');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    console.log('Connected!');
    const db = client.db('Lat-Aperture-People-Tracking');
    const doc = await db.collection('map_configurations').findOne({ id: 'metro-tower' });
    console.log('Found doc id:', doc?.id);
    console.log('floorplanUrl length:', doc?.floorplanUrl?.length);
    console.log('floorplanUrl prefix:', doc?.floorplanUrl?.slice(0, 30));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

test();
