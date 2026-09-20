async function run() {
  const baseUrl = 'http://localhost:3000';
  const tagId = 'E28011606000020788842D21';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer demo'
  };

  console.log('--- BEFORE UPDATE ---');
  let res = await fetch(`${baseUrl}/api/data/registered_people/${tagId}`, { headers });
  console.log('GET before:', (await res.json())?.name);

  console.log('--- SENDING UPDATE ---');
  const updateRes = await fetch(`${baseUrl}/api/data/registered_people/${tagId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: tagId,
      tagId: tagId,
      hardhatTagId: tagId,
      name: 'Sesuraja Site Lead',
      firstName: 'Sesuraja',
      lastName: 'Site Lead',
      role: 'Lead Project Safety Manager'
    })
  });
  console.log('POST status:', updateRes.status);

  for (let i = 0; i <= 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    res = await fetch(`${baseUrl}/api/data/registered_people/${tagId}`, { headers });
    const data = await res.json();
    console.log(`Second ${i + 1}: name="${data?.name}" firstName="${data?.firstName}" lastName="${data?.lastName}"`);
  }
}
run().catch(console.error);
