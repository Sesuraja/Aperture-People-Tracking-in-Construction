async function run() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@aperture.io', password: 'demo' })
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('User:', data.user);
  console.log('Token exists:', !!data.token);
  if (data.token) {
    const payload = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString());
    console.log('Decoded Token:', payload);
  }
}
run().catch(console.error);
