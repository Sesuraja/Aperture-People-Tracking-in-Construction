const { MongoClient } = require('mongodb');

const uri = 'mongodb://Sigmund:Jesuraja123@ac-vtqk6ag-shard-00-00.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-01.lxd6qba.mongodb.net:27017,ac-vtqk6ag-shard-00-02.lxd6qba.mongodb.net:27017/Lat-Aperture-People-Tracking?ssl=true&authSource=admin&replicaSet=atlas-p6339k-shard-0';
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db('Lat-Aperture-People-Tracking');
  
  // 1. Update map_configurations for metro-tower and org_main
  await db.collection('map_configurations').updateOne(
    { id: 'metro-tower' },
    { 
      $set: { 
        id: 'metro-tower',
        siteId: 'metro-tower',
        floorplanUrl: '/uploads/floorplans/floorplan_b2f0f225a9cc.png',
        organizationId: 'default'
      } 
    },
    { upsert: true }
  );

  await db.collection('map_configurations').updateOne(
    { id: 'org_main' },
    { 
      $set: { 
        id: 'org_main',
        floorplanUrl: '/uploads/floorplans/floorplan_b2f0f225a9cc.png',
        organizationId: 'default'
      } 
    },
    { upsert: true }
  );

  // 2. Update zones to default organizationId
  const zResult = await db.collection('zones').updateMany(
    { $or: [{ organizationId: 'org_main' }, { organizationId: { $exists: false } }] },
    { $set: { organizationId: 'default' } }
  );
  console.log(`Updated zones count: ${zResult.modifiedCount}`);

  // 3. Seed registered_people if empty, so workforce roster is immediately populated
  const peopleCount = await db.collection('registered_people').countDocuments();
  console.log(`Current registered_people count: ${peopleCount}`);
  if (peopleCount === 0) {
    const defaultWorkers = [
      {
        id: 'worker-101',
        hardhatTagId: 'HH-101',
        name: 'James Thornton',
        role: 'Site Supervisor',
        tradeCompany: 'Apex Structural',
        phone: '+1 (555) 019-2831',
        email: 'james.thornton@buildcorp.com',
        emergencyContact: 'Site EHS Team (+1 555-992-1100)',
        certifications: 'OSHA 30, First Aid, Crane Signaling',
        ppeStatus: 'COMPLIANT',
        shiftStatus: 'ON_SITE',
        trainingStatus: 'COMPLIANT',
        lastTrainingDate: '2026-05-15',
        trainingCourse: 'OSHA 30 Construction Safety',
        trainingExpiry: '2027-05-15',
        department: 'Operations Management',
        supervisor: 'Marcus Vance (EHS Director)',
        safetyScore: 98,
        currentZone: 'Zone 1 - Main Floor',
        organizationId: 'default',
        createdAt: new Date().toISOString()
      },
      {
        id: 'worker-102',
        hardhatTagId: 'HH-102',
        name: 'Maria Santos',
        role: 'Structural Engineer',
        tradeCompany: 'Apex Structural',
        phone: '+1 (555) 019-2832',
        email: 'maria.santos@buildcorp.com',
        emergencyContact: 'Carlos Santos (+1 555-992-1102)',
        certifications: 'PE Structural, Working at Heights',
        ppeStatus: 'COMPLIANT',
        shiftStatus: 'ON_SITE',
        trainingStatus: 'COMPLIANT',
        lastTrainingDate: '2026-06-10',
        trainingCourse: 'Structural Site Safety & Clearances',
        trainingExpiry: '2027-06-10',
        department: 'Civil Engineering',
        supervisor: 'Marcus Vance',
        safetyScore: 96,
        currentZone: 'Zone 2 - Electrical Substation',
        organizationId: 'default',
        createdAt: new Date().toISOString()
      },
      {
        id: 'worker-103',
        hardhatTagId: 'HH-103',
        name: 'David Kim',
        role: 'Master Electrician',
        tradeCompany: 'VoltTech Electrical',
        phone: '+1 (555) 019-2833',
        email: 'david.kim@volttech.com',
        emergencyContact: 'EHS Dispatch (+1 555-992-1103)',
        certifications: 'NFPA 70E Arc Flash, Master Electrician',
        ppeStatus: 'COMPLIANT',
        shiftStatus: 'ON_SITE',
        trainingStatus: 'COMPLIANT',
        lastTrainingDate: '2026-04-20',
        trainingCourse: 'High-Voltage Site Safety',
        trainingExpiry: '2027-04-20',
        department: 'Electrical Works',
        supervisor: 'David Kim',
        safetyScore: 92,
        currentZone: 'Zone 2 - Electrical Substation',
        organizationId: 'default',
        createdAt: new Date().toISOString()
      },
      {
        id: 'worker-104',
        hardhatTagId: 'HH-104',
        name: 'Sarah Connor',
        role: 'Safety Officer (EHS)',
        tradeCompany: 'SafetyFirst Consulting',
        phone: '+1 (555) 019-2834',
        email: 'sarah.connor@safetyfirst.com',
        emergencyContact: 'EHS Central (+1 555-992-1104)',
        certifications: 'CSP, OSHA 500, HazMat Response',
        ppeStatus: 'COMPLIANT',
        shiftStatus: 'ON_SITE',
        trainingStatus: 'COMPLIANT',
        lastTrainingDate: '2026-07-01',
        trainingCourse: 'Emergency SOS & Evacuation Leadership',
        trainingExpiry: '2027-07-01',
        department: 'Site Safety & EHS',
        supervisor: 'Marcus Vance',
        safetyScore: 100,
        currentZone: 'Zone 3 - Scaffold Tower B',
        organizationId: 'default',
        createdAt: new Date().toISOString()
      },
      {
        id: 'worker-105',
        hardhatTagId: 'HH-105',
        name: 'Ahmed Hassan',
        role: 'Heavy Equipment Operator',
        tradeCompany: 'Titan Heavy Machinery',
        phone: '+1 (555) 019-2835',
        email: 'ahmed.hassan@titanmachinery.com',
        emergencyContact: 'Fatima Hassan (+1 555-992-1105)',
        certifications: 'NCCCO Crane Certified, Forklift Class 7',
        ppeStatus: 'WARNING',
        shiftStatus: 'ON_SITE',
        trainingStatus: 'DUE_SOON',
        lastTrainingDate: '2025-08-15',
        trainingCourse: 'Heavy Equipment Operations & Clearances',
        trainingExpiry: '2026-08-15',
        department: 'Logistics & Equipment',
        supervisor: 'James Thornton',
        safetyScore: 84,
        currentZone: 'Zone 4 - Concrete Staging Yard',
        organizationId: 'default',
        createdAt: new Date().toISOString()
      }
    ];

    await db.collection('registered_people').insertMany(defaultWorkers);
    console.log('Seeded registered_people collection in MongoDB Atlas successfully!');
  }

  const check = await db.collection('map_configurations').findOne({ id: 'metro-tower' });
  console.log('Verified metro-tower map configuration:', { id: check.id, org: check.organizationId, floorplanUrl: check.floorplanUrl });

  await client.close();
}

run().catch(console.error);
