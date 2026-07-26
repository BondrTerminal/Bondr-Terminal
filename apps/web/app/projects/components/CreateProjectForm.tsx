'use client';

import { useState } from 'react';

export function CreateProjectForm() {
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [launchPath, setLaunchPath] = useState('pump.fun');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function createProject() {
    setStatus('');
    setError('');
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ticker, launchPath })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? 'Project creation failed.');
      return;
    }
    if (data.persisted === false) {
      setStatus(`Preview draft generated for ${data.project.name}. Persistence is disabled on Vercel until durable storage is connected.`);
      return;
    }
    setStatus(`Created ${data.project.name}. Refreshing…`);
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <section className="documentCard createProjectPanel">
      <div className="sectionIntro compactIntro">
        <span>Create</span>
        <h2>New project draft</h2>
        <p>Create a project record through the projects API. Local development persists to JSON; production deployment should connect durable storage before multi-user use. No token, wallet, signing, or fund action occurs here.</p>
      </div>
      <div className="deployFormPreview createProjectForm">
        <input placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} />
        <input placeholder="Ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} />
        <select value={launchPath} onChange={(event) => setLaunchPath(event.target.value)}>
          <option value="pump.fun">Pump.fun</option>
          <option value="raydium">Raydium</option>
          <option value="unselected">Unselected</option>
        </select>
        <button className="button" type="button" onClick={createProject} disabled={!name || !ticker}>Create project draft</button>
      </div>
      {status && <p className="profitText">{status}</p>}
      {error && <p className="dangerText">{error}</p>}
    </section>
  );
}
