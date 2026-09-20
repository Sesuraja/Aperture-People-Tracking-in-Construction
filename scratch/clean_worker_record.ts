import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  const tagId = 'E28011606000020788842D21';

  const cleanWorker = {
    id: tagId,
    tagId: tagId,
    hardhatTagId: tagId,
    name: 'Sesuraja Site Lead',
    firstName: 'Sesuraja',
    lastName: 'Site Lead',
    role: 'Lead Project Safety Manager',
    company: 'Aperture Engineering Corp',
    tradeCompany: 'Aperture Engineering Corp',
    department: 'Safety & Compliance',
    phone: '+1 (555) 234-5678',
    email: 'sesuraja@aperture.io',
    emergencyContact: '+1 (555) 999-0000',
    supervisor: 'Marcus Vance',
    notes: 'Primary certified site safety overseer for Zone 1 & 2',
    currentZone: 'Zone1',
    shiftStatus: 'ON_SITE',
    ppeStatus: 'COMPLIANT',
    trainingStatus: 'COMPLIANT',
    certifications: 'OSHA 30, First Aid, CPR, Fall Protection',
    isCustomProfile: true,
    updatedAt: new Date().toISOString()
  };

  await db.collection('registered_people').updateMany(
    { $or: [{ id: tagId }, { tagId: tagId }, { hardhatTagId: tagId }] },
    { $set: cleanWorker }
  );

  await db.collection('people').updateMany(
    { $or: [{ id: tagId }, { tagId: tagId }, { hardhatTagId: tagId }] },
    { $set: cleanWorker }
  );

  await db.collection('live_tags').updateMany(
    { $or: [{ id: tagId }, { tagId: tagId }, { TagID: tagId }] },
    { $set: { name: 'Sesuraja Site Lead', FirstName: 'Sesuraja', LastName: 'Site Lead', role: 'Lead Project Safety Manager' } }
  );

  await db.collection('real_time_tags').updateMany(
    { $or: [{ id: tagId }, { tagId: tagId }, { TagID: tagId }] },
    { $set: { name: 'Sesuraja Site Lead', FirstName: 'Sesuraja', LastName: 'Site Lead', role: 'Lead Project Safety Manager' } }
  );

  console.log('Successfully cleaned and synced worker records in MongoDB Atlas!');
  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
