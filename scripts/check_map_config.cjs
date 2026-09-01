console.log('Script starting...');
const fetch = globalThis.fetch;

async function check() {
  console.log('Fetching map_configurations...');
  const res = await fetch('http://127.0.0.1:3000/api/data/map_configurations/metro-tower', {
    headers: { 'Authorization': 'Bearer demo' }
  });
  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('ID:', data?.id);
  console.log('floorplanUrl starts with:', data?.floorplanUrl?.slice(0, 40));
  console.log('floorplanUrl length:', data?.floorplanUrl?.length);
}

check().catch(console.error);
