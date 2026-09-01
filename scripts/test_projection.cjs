const { MongoClient } = require('mongodb');

const uri = 'mongodb://Sigmund:Jesuraja123@ac-vtqk6ag-shard-00-00.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-01.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-02.lxd6qba.mongodb.net:27017/Lat-Aperture-People-Tracking?ssl=true&authSource=admin&replicaSet=atlas-p6339k-shard-0';

async function test() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  const t0 = Date.now();
  const doc = await db.collection('map_configurations').findOne({ id: 'metro-tower' }, { projection: { id: 1, siteId: 1, organizationId: 1, updatedAt: 1 } });
  console.log('Projected doc in', Date.now() - t0, 'ms:', doc);
  await client.close();
}

test().catch(console.error);
