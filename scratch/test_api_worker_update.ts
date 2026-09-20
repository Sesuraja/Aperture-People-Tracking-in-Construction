import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const baseUrl = 'http://localhost:3000';
  const tagId = 'E28011606000020788842D21';

  console.log('1. Fetching login token for demo user...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@aperture.io', password: 'demo' })
  }).catch(() => null);

  let token = 'demo';
  if (loginRes && loginRes.ok) {
    const loginData = await loginRes.json();
    token = loginData.token || 'demo';
  }
  console.log('Using token:', token ? 'Token acquired' : 'demo fallback');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('\n2. Updating worker profile via API (POST /api/data/registered_people/' + tagId + ')...');
  const updatePayload = {
    id: tagId,
    tagId: tagId,
    hardhatTagId: tagId,
    name: 'Sesuraja Site Lead',
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
    certifications: 'OSHA 30, First Aid, CPR, Fall Protection'
  };

  const updateRes = await fetch(`${baseUrl}/api/data/registered_people/${tagId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(updatePayload)
  });
  console.log('Update response status:', updateRes.status);
  const updateJson = await updateRes.json();
  console.log('Update response body:', {
    id: updateJson?.doc?.id || updateJson?.id,
    name: updateJson?.doc?.name || updateJson?.name,
    role: updateJson?.doc?.role || updateJson?.role,
    phone: updateJson?.doc?.phone || updateJson?.phone
  });

  console.log('\n3. Waiting 6 seconds to let UHF background poller run and ensure name is preserved...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('\n4. Verifying worker in registered_people:');
  const checkRes = await fetch(`${baseUrl}/api/data/registered_people`, { headers });
  const people = await checkRes.json();
  const worker = (people || []).find((p: any) => (p.tagId || p.id || p.hardhatTagId) === tagId);
  console.log('Worker in registered_people:', {
    id: worker?.id,
    name: worker?.name,
    role: worker?.role,
    department: worker?.department,
    phone: worker?.phone,
    email: worker?.email,
    supervisor: worker?.supervisor,
    notes: worker?.notes
  });

  console.log('\n5. Verifying dynamic data in alerts:');
  const alertsRes = await fetch(`${baseUrl}/api/data/alerts`, { headers });
  const alerts = await alertsRes.json();
  console.log(`Alerts count: ${alerts.length}`);
  if (alerts.length > 0) {
    console.log('Sample alert:', {
      id: alerts[0].id,
      type: alerts[0].type,
      message: alerts[0].message,
      personName: alerts[0].personName,
      location: alerts[0].location
    });
  }

  console.log('\n6. Verifying dynamic data in incidents:');
  const incidentsRes = await fetch(`${baseUrl}/api/data/incidents`, { headers });
  const incidents = await incidentsRes.json();
  console.log(`Incidents count: ${incidents.length}`);
  if (incidents.length > 0) {
    console.log('Sample incident:', {
      id: incidents[0].id,
      title: incidents[0].title,
      severity: incidents[0].severity,
      zone: incidents[0].zone,
      personName: incidents[0].personName
    });
  }

  if (worker?.name === 'Sesuraja Site Lead' && worker?.phone === '+1 (555) 234-5678') {
    console.log('\n>>> SUCCESS: Worker profile updated, persisted to MongoDB, and preserved by telemetry poller!');
  } else {
    console.error('\n>>> FAILURE: Worker name or profile was not properly updated/preserved.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
