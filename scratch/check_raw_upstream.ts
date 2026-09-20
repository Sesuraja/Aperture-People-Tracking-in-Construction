import dotenv from 'dotenv';
dotenv.config();

async function checkExternal() {
  const host = process.env.PEOPLE_TRACKING_API_HOST || 'http://localhost:3000';
  console.log('PEOPLE_TRACKING_API_HOST:', host);
  const res = await fetch(`${host}/api/GetHistoryRecords/0/5`);
  const data = await res.json();
  console.log('Raw from host:');
  console.log(JSON.stringify(data, null, 2));
}
checkExternal().catch(console.error);
