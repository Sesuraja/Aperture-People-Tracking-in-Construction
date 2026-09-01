import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://Sigmund:Jesuraja123@cluster0.lxd6qba.mongodb.net/Lat-Aperture-People-Tracking';
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db();

  const publicUploadDir = path.join(process.cwd(), 'public', 'uploads', 'floorplans');
  const distUploadDir = path.join(process.cwd(), 'dist', 'uploads', 'floorplans');
  for (const dir of [publicUploadDir, distUploadDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 1. Inspect zones
  const zones = await db.collection('zones').find({}).toArray();
  for (const z of zones) {
    if (z.id === 'batch') {
      console.log('Found bogus batch document in zones! Extracting floorplanUrl...');
      if (z.floorplanUrl && z.floorplanUrl.startsWith('data:image/')) {
        const matches = z.floorplanUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const hash = crypto.createHash('md5').update(matches[2]).digest('hex').slice(0, 12);
          const filename = `floorplan_${hash}.${ext}`;
          for (const dir of [publicUploadDir, distUploadDir]) {
            fs.writeFileSync(path.join(dir, filename), Buffer.from(matches[2], 'base64'));
          }
          console.log('Saved batch floorplan image to disk:', filename);
        }
      }
      // If there are real zones array inside batch, restore them
      if (Array.isArray(z.zones) && z.zones.length > 0) {
        for (const realZone of z.zones) {
          if (realZone.id || realZone.zoneId) {
            await db.collection('zones').updateOne(
              { id: realZone.id || realZone.zoneId },
              { $set: realZone },
              { upsert: true }
            );
            console.log('Restored zone from batch:', realZone.name || realZone.id);
          }
        }
      }
      await db.collection('zones').deleteOne({ _id: z._id });
      console.log('Deleted bogus batch document from zones collection.');
    }
  }

  // 2. Inspect map_configurations
  const maps = await db.collection('map_configurations').find({}).toArray();
  for (const m of maps) {
    let modified = false;
    const updateDoc = {};

    if (m.floorplanUrl && m.floorplanUrl.startsWith('data:image/')) {
      const matches = m.floorplanUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const hash = crypto.createHash('md5').update(matches[2]).digest('hex').slice(0, 12);
        const filename = `floorplan_${hash}.${ext}`;
        for (const dir of [publicUploadDir, distUploadDir]) {
          fs.writeFileSync(path.join(dir, filename), Buffer.from(matches[2], 'base64'));
        }
        const newUrl = `/uploads/floorplans/${filename}`;
        console.log('Saved map_configuration floorplan image to disk:', filename, 'newUrl:', newUrl);
        updateDoc.floorplanUrl = newUrl;
        modified = true;
      }
    }

    if (modified) {
      await db.collection('map_configurations').updateOne({ _id: m._id }, { $set: updateDoc });
      console.log('Updated map_configuration doc', m.id, 'with clean static URL.');
    }
  }

  console.log('All migrations completed successfully!');
  await client.close();
}

run().catch(console.error);
