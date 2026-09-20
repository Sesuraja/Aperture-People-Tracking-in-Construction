import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch {}
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function searchAll() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('No MONGODB_URI');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  
  const cols = await db.listCollections().toArray();
  for (const c of cols) {
    const colName = c.name;
    const docs = await db.collection(colName).find({
      $or: [
        { name: /John/i },
        { FirstName: /John/i },
        { firstName: /John/i }
      ]
    }).limit(10).toArray();
    if (docs.length > 0) {
      console.log(`=== Collection: ${colName} (found ${docs.length} matching John) ===`);
      docs.forEach(d => console.log('  ', { _id: d._id, id: d.id, TagID: d.TagID, name: d.name, FirstName: d.FirstName, firstName: d.firstName }));
    }
  }

  await client.close();
}
searchAll().catch(console.error);
