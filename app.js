// public/app.js

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const lobbyOverlay = document.getElementById('lobby-overlay');
  const joinBtn = document.getElementById('join-btn');
  const usernameInput = document.getElementById('username-input');
  const roomInput = document.getElementById('room-input');
  const appStudio = document.getElementById('app-studio');
  const lobbyRoomsList = document.getElementById('lobby-rooms-list');
  const sequencerRowsContainer = document.getElementById('sequencer-rows-container');
  
  // Controls
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const recordBtn = document.getElementById('record-btn');
  const bpmValInput = document.getElementById('bpm-val-input');
  const bpmSliderInput = document.getElementById('bpm-slider-input');
  const currentRoomText = document.getElementById('current-room-text');
  
  // Sidebar (Removed)
  const latencyText = document.getElementById('latency-text');
  const latencyDot = document.getElementById('latency-indicator-dot');
  
  // Recording
  const recordingStatusBar = document.getElementById('recording-status-bar');
  const recordingDuration = document.getElementById('recording-duration');
  const wavDownloadBtn = document.getElementById('wav-download-btn');

  // Socket
  const socket = io();

  // State
  let clientToServerOffset = 0; // ms
  let pingInterval = null;
  let roomState = null;
  let isConnected = false;

  // Audio State
  let audioContextInitialized = false;
  let samplers = {}; // trackId -> Tone.Sampler
  let volumeNodes = {}; // trackId -> Tone.Volume
  let panNodes = {}; // trackId -> Tone.Panner
  let reverbSends = {}; // trackId -> Tone.Gain
  let delaySends = {}; // trackId -> Tone.Gain
  let globalReverb, globalDelay;
  let masterVolume;
  
  let sequencer = null;
  
  // Recording
  let recorderNode = null;
  let isRecording = false;
  let leftChannel = [];
  let rightChannel = [];
  let recordingStart = 0;
  let recordingTimer = null;
  
  // Tracks Config
  const trackConfigs = [
    { id: 'kick', name: 'Kick', type: 'drum', color: '#ff5f7e' },
    { id: 'snare', name: 'Snare', type: 'drum', color: '#00f5ff' },
    { id: 'hihat', name: 'Hi-Hat', type: 'drum', color: '#bd57fa' },
    { id: 'bass', name: 'Bass', type: 'melodic', color: '#ffb319' },
    { id: 'synth', name: 'Synth', type: 'melodic', color: '#00ff87' },
    { id: 'pad', name: 'Pad', type: 'chord', color: '#8a9aec' }
  ];

  // Samples Library Data
  const sampleLibrary = [
    { id: 'kick-808', name: 'Classic 808', track: 'kick' },
    { id: 'kick-acoustic', name: 'Punchy Acoustic', track: 'kick' },
    { id: 'kick-lofi', name: 'Lo-Fi Sub', track: 'kick' },
    { id: 'snare-analog', name: 'Analog Noise', track: 'snare' },
    { id: 'snare-acoustic', name: 'Snappy Rim', track: 'snare' },
    { id: 'snare-clap', name: '808 Clap', track: 'snare' },
    { id: 'hat-closed', name: 'Tight Closed', track: 'hihat' },
    { id: 'hat-open', name: 'Long Open', track: 'hihat' },
    { id: 'hat-lofi', name: 'Crunchy Lo-Fi', track: 'hihat' },
    { id: 'bass-sub', name: 'Sub Sine', track: 'bass' },
    { id: 'bass-acid', name: 'Resonant Acid', track: 'bass' },
    { id: 'synth-lead', name: 'Square Lead', track: 'synth' },
    { id: 'synth-bell', name: 'FM Bell', track: 'synth' },
    { id: 'pad-ambient', name: 'Warm Ambient', track: 'pad' }
  ];

  // 1. Initial Data Fetch (Public Rooms)
  fetch('/api/rooms')
    .then(r => r.json())
    .then(rooms => updateLobbyRooms(rooms));

  socket.on('public-rooms-list', updateLobbyRooms);

  function updateLobbyRooms(rooms) {
    if (rooms.length === 0) {
      lobbyRoomsList.innerHTML = '<div class="room-empty-msg">No active rooms. Create one above!</div>';
      return;
    }
    lobbyRoomsList.innerHTML = rooms.map(r => `
      <div class="room-item" data-room="${r.id}">
        <span class="room-item-name">${r.id}</span>
        <span class="room-item-users">${r.userCount} online</span>
      </div>
    `).join('');
    
    // Bind clicks
    lobbyRoomsList.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', () => {
        roomInput.value = el.dataset.room;
        if (!usernameInput.value) usernameInput.focus();
        else joinBtn.click();
      });
    });
  }

  // 2. Clock Synchronization (NTP Ping-Pong)
  function startNTPCalibration() {
    let pings = [];
    const doPing = () => {
      socket.emit('sync-ping', Date.now());
    };
    
    socket.on('sync-pong', ({ clientTime, serverTime }) => {
      const now = Date.now();
      const rtt = now - clientTime;
      const latency = rtt / 2;
      const offset = serverTime - (now - latency);
      
      pings.push({ rtt, offset });
      if (pings.length > 5) pings.shift();
      
      // Use the offset with the lowest RTT for highest accuracy
      const bestPing = pings.reduce((min, p) => p.rtt < min.rtt ? p : min, pings[0]);
      clientToServerOffset = bestPing.offset;
      
      // Update UI
      latencyText.innerText = `${Math.round(bestPing.rtt)} ms ping`;
      if (bestPing.rtt < 80) {
        latencyDot.className = 'latency-dot';
      } else if (bestPing.rtt < 200) {
        latencyDot.className = 'latency-dot warning';
      } else {
        latencyDot.className = 'latency-dot danger';
      }
    });

    // Initial burst
    for(let i=0; i<3; i++) setTimeout(doPing, i * 200);
    
    // Periodic calibration
    pingInterval = setInterval(doPing, 5000);
  }

  // Helper to get estimated server time
  function getServerTime() {
    return Date.now() + clientToServerOffset;
  }

  // 3. Join Room & Audio Initialization
  joinBtn.addEventListener('click', async () => {
    const user = usernameInput.value.trim() || 'Anonymous_' + Math.floor(Math.random()*1000);
    const room = roomInput.value.trim() || 'default';
    
    // Initialize Web Audio and synthesize buffers (Requires user gesture)
    if (!audioContextInitialized) {
      await Tone.start();
      console.log('Audio Context started');
      joinBtn.innerText = 'Synthesizing Audio...';
      joinBtn.disabled = true;
      
      if (window.synthesizeSamples) {
        await window.synthesizeSamples();
      }
      
      setupAudioGraph();
      audioContextInitialized = true;
    }

    // Join via Socket
    socket.emit('join-room', { roomId: room, username: user });
    
    // Setup UI
    lobbyOverlay.classList.add('hidden');
    appStudio.classList.add('visible');
    currentRoomText.innerText = room;
    
    startNTPCalibration();
  });

  // 4. Setup Tone.js Audio Graph
  function setupAudioGraph() {
    masterVolume = new Tone.Volume(0).toDestination();
    
    // Global Effects
    globalReverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.1, wet: 1 }).connect(masterVolume);
    globalDelay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.4, wet: 1 }).connect(masterVolume);
    
    // Setup track nodes
    trackConfigs.forEach(config => {
      const id = config.id;
      
      panNodes[id] = new Tone.Panner(0);
      volumeNodes[id] = new Tone.Volume(0);
      reverbSends[id] = new Tone.Gain(0).connect(globalReverb);
      delaySends[id] = new Tone.Gain(0).connect(globalDelay);
      
      panNodes[id].connect(volumeNodes[id]);
      volumeNodes[id].connect(masterVolume); // dry
      volumeNodes[id].connect(reverbSends[id]); // send 1
      volumeNodes[id].connect(delaySends[id]); // send 2
    });

    // Setup Sequence
    sequencer = new Tone.Sequence((time, step) => {
      if (roomState && roomState.isPlaying) {
        processStepAudio(step, time);
      }
      Tone.Draw.schedule(() => {
        highlightPlayhead(step);
      }, time);
    }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "16n");

    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = "1m";
  }

  // Load a sample into a track
  function loadSampleIntoTrack(trackId, sampleId) {
    if (samplers[trackId]) {
      samplers[trackId].dispose();
    }
    
    const buffer = window.sampleBuffers[sampleId];
    if (!buffer) return;

    let baseNote = "C4";
    if (trackId === 'bass') baseNote = "C2";
    if (trackId === 'pad') baseNote = "C3";
    if (trackId === 'kick') baseNote = "C2";

    samplers[trackId] = new Tone.Sampler({
      urls: { [baseNote]: buffer },
      onload: () => { console.log(`Loaded ${sampleId} on ${trackId}`); }
    }).connect(panNodes[trackId]);
  }

  // Trigger Audio for a Step
  function processStepAudio(step, time) {
    if (!roomState) return;
    
    roomState.tracks.forEach(track => {
      if (track.steps[step] && samplers[track.id]) {
        if (track.id === 'bass' || track.id === 'synth') {
          const note = track.notes[step];
          samplers[track.id].triggerAttackRelease(note, "8n", time);
        } else if (track.id === 'pad') {
          const chordName = track.chords[step];
          const notes = getNotesForChord(chordName);
          samplers[track.id].triggerAttackRelease(notes, "4n", time);
        } else {
          const baseNote = (track.id === 'kick') ? "C2" : "C4";
          samplers[track.id].triggerAttackRelease(baseNote, "8n", time);
        }
      }
    });
  }

  // 5. Socket Sync Events
  socket.on('room-state', (state) => {
    roomState = state;
    
    updateBPMUI(state.bpm);
    Tone.Transport.bpm.value = state.bpm;
    
    state.tracks.forEach(track => {
      loadSampleIntoTrack(track.id, track.sample);
      applyKnobsToAudio(track.id, track.knobs);
    });

    renderSequencerGrid();
    syncTransportFromServer(state);
  });

  socket.on('user-joined', (data) => {
    if(!roomState) return;
    roomState.users = data.users;
  });

  socket.on('user-left', (data) => {
    if(!roomState) return;
    roomState.users = data.users;
  });

  socket.on('track-claimed', ({ trackId, owner, ownerName }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      t.owner = owner;
      t.ownerName = ownerName;
      updateTrackOwnerUI(trackId);
    }
  });

  socket.on('track-released', ({ trackId }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      t.owner = null;
      t.ownerName = null;
      updateTrackOwnerUI(trackId);
    }
  });

  socket.on('step-toggled', ({ trackId, stepIndex, state }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      t.steps[stepIndex] = state;
      updateStepUI(trackId, stepIndex, state);
    }
  });

  socket.on('note-updated', ({ trackId, stepIndex, note }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      if (t.notes) t.notes[stepIndex] = note;
      if (t.chords) t.chords[stepIndex] = note;
      updateStepUI(trackId, stepIndex, t.steps[stepIndex]);
    }
  });

  socket.on('knob-updated', ({ trackId, knob, value }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      t.knobs[knob] = value;
      applyKnobsToAudio(trackId, t.knobs);
      updateKnobUI(trackId, knob, value);
    }
  });

  socket.on('sample-updated', ({ trackId, sampleId }) => {
    const t = roomState.tracks.find(x => x.id === trackId);
    if (t) {
      t.sample = sampleId;
      loadSampleIntoTrack(trackId, sampleId);
    }
  });

  // Transport Sync
  socket.on('transport-start', ({ startTime, startStep }) => {
    if (!roomState) return;
    roomState.isPlaying = true;
    roomState.playbackStartedServerTime = startTime;
    roomState.playbackStartStep = startStep;
    syncTransportFromServer(roomState);
  });

  socket.on('transport-pause', ({ startStep }) => {
    if (!roomState) return;
    roomState.isPlaying = false;
    roomState.playbackStartedServerTime = null;
    roomState.playbackStartStep = startStep;
    syncTransportFromServer(roomState);
  });

  socket.on('transport-stop', () => {
    if (!roomState) return;
    roomState.isPlaying = false;
    roomState.playbackStartedServerTime = null;
    roomState.playbackStartStep = 0;
    syncTransportFromServer(roomState);
  });

  socket.on('bpm-changed', ({ bpm, playbackStartedServerTime, playbackStartStep }) => {
    if (!roomState) return;
    roomState.bpm = bpm;
    roomState.playbackStartedServerTime = playbackStartedServerTime;
    roomState.playbackStartStep = playbackStartStep;
    
    updateBPMUI(bpm);
    Tone.Transport.bpm.value = bpm;
    syncTransportFromServer(roomState);
  });

  // Chat messages ignored on client since chat is removed

  // 6. Transport State Calculator
  function syncTransportFromServer(state) {
    Tone.Transport.stop();
    sequencer.stop();
    
    playBtn.classList.toggle('active', state.isPlaying);
    pauseBtn.classList.remove('active');

    if (state.isPlaying && state.playbackStartedServerTime) {
      const serverNow = getServerTime();
      let delayMs = state.playbackStartedServerTime - serverNow;
      
      let startOffsetSec = 0;
      let startContextTime = Tone.context.currentTime;
      
      const msPerBeat = 60000 / state.bpm;
      const msPerStep = msPerBeat / 4;
      
      if (delayMs > 0) {
        startContextTime += (delayMs / 1000);
        startOffsetSec = (state.playbackStartStep % 16) * (msPerStep / 1000);
      } else {
        const elapsedMs = Math.abs(delayMs);
        const stepsElapsed = elapsedMs / msPerStep;
        const totalSteps = state.playbackStartStep + stepsElapsed;
        startOffsetSec = (totalSteps % 16) * (msPerStep / 1000);
      }
      
      sequencer.start(0);
      Tone.Transport.start(startContextTime, startOffsetSec);
    } else {
      if (state.playbackStartStep > 0) {
        pauseBtn.classList.add('active');
        highlightPlayhead(Math.floor(state.playbackStartStep));
      } else {
        stopBtn.classList.add('active');
        setTimeout(()=>stopBtn.classList.remove('active'), 200);
        highlightPlayhead(-1);
      }
    }
  }

  // 7. Render UI
  function renderSequencerGrid() {
    sequencerRowsContainer.innerHTML = '';
    
    roomState.tracks.forEach(track => {
      const isMine = track.owner === socket.id;
      const isOwned = track.owner !== null;
      
      let claimClass = '';
      let claimText = 'Claim';
      if (isMine) { claimClass = 'mine'; claimText = 'Release'; }
      else if (isOwned) { claimClass = 'owned'; claimText = track.ownerName; }
      
      const row = document.createElement('div');
      row.className = `sequencer-row track-${track.id}`;
      row.dataset.trackId = track.id;
      
      const info = document.createElement('div');
      info.className = 'track-info';
      
      const identity = document.createElement('div');
      identity.className = 'track-identity';
      identity.innerHTML = `
        <div class="track-label">
          <div class="track-dot"></div>
          ${track.name}
        </div>
        <button class="track-btn-claim ${claimClass}" data-track="${track.id}">${claimText}</button>
      `;
      info.appendChild(identity);
      
      const knobs = document.createElement('div');
      knobs.className = 'track-knobs';
      knobs.innerHTML = `
        <div class="knob-container ${!isMine ? 'disabled' : ''}">
          <div class="dial-knob" data-track="${track.id}" data-param="volume" title="Volume"></div>
          <span class="knob-label">Vol</span>
        </div>
        <div class="knob-container ${!isMine ? 'disabled' : ''}">
          <div class="dial-knob" data-track="${track.id}" data-param="pan" title="Pan"></div>
          <span class="knob-label">Pan</span>
        </div>
        <div class="knob-container ${!isMine ? 'disabled' : ''}">
          <div class="dial-knob" data-track="${track.id}" data-param="delay" title="Delay Send"></div>
          <span class="knob-label">Dly</span>
        </div>
        <div class="knob-container ${!isMine ? 'disabled' : ''}">
          <div class="dial-knob" data-track="${track.id}" data-param="reverb" title="Reverb Send"></div>
          <span class="knob-label">Rev</span>
        </div>
      `;
      info.appendChild(knobs);
      row.appendChild(info);
      
      const stepsGrid = document.createElement('div');
      stepsGrid.className = 'steps-grid';
      for(let i=0; i<16; i++) {
        const btn = document.createElement('div');
        btn.className = 'step-btn' + (track.steps[i] ? ' active' : '') + (!isMine ? ' disabled' : '');
        btn.dataset.track = track.id;
        btn.dataset.step = i;
        
        if (track.notes && track.steps[i]) btn.innerText = track.notes[i];
        if (track.chords && track.steps[i]) btn.innerText = track.chords[i];
        
        stepsGrid.appendChild(btn);
      }
      row.appendChild(stepsGrid);
      
      // Drag and drop sample logic removed
      
      sequencerRowsContainer.appendChild(row);
      updateKnobsFromState(track.id, track.knobs);
    });
    
    bindSequencerEvents();
  }

  function updateTrackOwnerUI(trackId) {
    renderSequencerGrid();
  }

  function updateStepUI(trackId, stepIndex, state) {
    const row = document.querySelector(`.sequencer-row[data-track-id="${trackId}"]`);
    if(row) {
      const btn = row.querySelectorAll('.step-btn')[stepIndex];
      if (btn) {
        if (state) btn.classList.add('active');
        else btn.classList.remove('active');
        
        const track = roomState.tracks.find(t=>t.id===trackId);
        if (state && track.notes) btn.innerText = track.notes[stepIndex];
        else if (state && track.chords) btn.innerText = track.chords[stepIndex];
        else btn.innerText = '';
      }
    }
  }

  // 8. Interaction Bindings
  function bindSequencerEvents() {
    document.querySelectorAll('.track-btn-claim').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.dataset.track;
        if (e.target.classList.contains('mine')) {
          socket.emit('release-track', trackId);
        } else if (!e.target.classList.contains('owned')) {
          socket.emit('claim-track', trackId);
        }
      });
    });

    document.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.classList.contains('disabled')) return;
        const trackId = btn.dataset.track;
        const stepIndex = parseInt(btn.dataset.step);
        
        const wasActive = btn.classList.contains('active');
        socket.emit('toggle-step', { trackId, stepIndex, state: !wasActive });
        
        if (!wasActive && samplers[trackId]) {
           const track = roomState.tracks.find(t=>t.id===trackId);
           let note = "C4";
           if (track.notes) note = track.notes[stepIndex];
           else if (track.chords) note = getNotesForChord(track.chords[stepIndex])[0]; // Use root note for preview
           else if (trackId === 'kick' || trackId === 'bass') note = "C2";
           samplers[trackId].triggerAttackRelease(note, "8n");
        }
      });

      btn.addEventListener('contextmenu', (e) => {
        if (btn.classList.contains('disabled')) return;
        e.preventDefault();
        const trackId = btn.dataset.track;
        const stepIndex = parseInt(btn.dataset.step);
        const track = roomState.tracks.find(t=>t.id===trackId);
        if (track.notes || track.chords) {
          showNoteSelector(e.pageX, e.pageY, track, stepIndex);
        }
      });
    });

    document.querySelectorAll('.dial-knob').forEach(knob => {
      let isDragging = false;
      let startY;
      let startVal;

      knob.addEventListener('mousedown', (e) => {
        const container = knob.parentElement;
        if (container.classList.contains('disabled')) return;
        
        isDragging = true;
        startY = e.clientY;
        const param = knob.dataset.param;
        const trackId = knob.dataset.track;
        startVal = roomState.tracks.find(t=>t.id===trackId).knobs[param];
        
        document.body.style.cursor = 'ns-resize';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = startY - e.clientY;
        let newVal = startVal + (delta / 100);
        newVal = Math.max(0, Math.min(1, newVal));
        if (knob.dataset.param === 'pan') {
          newVal = startVal + (delta / 50);
          newVal = Math.max(-1, Math.min(1, newVal));
        }

        const param = knob.dataset.param;
        const trackId = knob.dataset.track;
        
        updateKnobUI(trackId, param, newVal);
        applyKnobsToAudio(trackId, { [param]: newVal });
        
        socket.emit('update-knob', { trackId, knob: param, value: newVal });
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.cursor = 'default';
        }
      });
    });
  }

  function updateKnobUI(trackId, param, val) {
    const row = document.querySelector(`.sequencer-row[data-track-id="${trackId}"]`);
    if(row) {
      const knob = row.querySelector(`.dial-knob[data-param="${param}"]`);
      if (knob) {
        let degrees = 0;
        if (param === 'pan') degrees = val * 135;
        else degrees = -135 + (val * 270);
        knob.style.transform = `rotate(${degrees}deg)`;
      }
    }
  }

  function updateKnobsFromState(trackId, knobs) {
    updateKnobUI(trackId, 'volume', knobs.volume);
    updateKnobUI(trackId, 'pan', knobs.pan);
    updateKnobUI(trackId, 'delay', knobs.delay);
    updateKnobUI(trackId, 'reverb', knobs.reverb);
  }

  function applyKnobsToAudio(trackId, knobs) {
    if (knobs.volume !== undefined && volumeNodes[trackId]) {
      const db = knobs.volume === 0 ? -Infinity : Tone.gainToDb(knobs.volume);
      volumeNodes[trackId].volume.value = db;
    }
    if (knobs.pan !== undefined && panNodes[trackId]) {
      panNodes[trackId].pan.value = knobs.pan;
    }
    if (knobs.reverb !== undefined && reverbSends[trackId]) {
      reverbSends[trackId].gain.value = knobs.reverb;
    }
    if (knobs.delay !== undefined && delaySends[trackId]) {
      delaySends[trackId].gain.value = knobs.delay;
    }
  }

  function highlightPlayhead(step) {
    const line = document.getElementById('playhead-line');
    if (step < 0) {
      line.style.display = 'none';
      return;
    }
    line.style.display = 'block';
    
    const markers = document.querySelectorAll('.marker');
    if (markers[step]) {
      const boxRect = document.getElementById('sequencer-grid-box').getBoundingClientRect();
      const markerRect = markers[step].getBoundingClientRect();
      line.style.left = (markerRect.left - boxRect.left) + 'px';
      line.style.width = markerRect.width + 'px';
    }
  }

  // Sample library and presence render functions removed

  // Transport Controls
  playBtn.addEventListener('click', () => socket.emit('transport-play'));
  pauseBtn.addEventListener('click', () => socket.emit('transport-pause'));
  stopBtn.addEventListener('click', () => socket.emit('transport-stop'));
  
  bpmSliderInput.addEventListener('input', (e) => {
    bpmValInput.value = e.target.value;
  });
  bpmSliderInput.addEventListener('change', (e) => {
    socket.emit('change-bpm', parseInt(e.target.value));
  });
  bpmValInput.addEventListener('change', (e) => {
    bpmSliderInput.value = e.target.value;
    socket.emit('change-bpm', parseInt(e.target.value));
  });

  document.getElementById('tap-tempo-btn').addEventListener('click', () => {
     // Optional: simple tap tempo implementation could go here
  });

  function updateBPMUI(bpm) {
    bpmValInput.value = bpm;
    bpmSliderInput.value = bpm;
  }

  // Chat event listeners removed

  // Note Selector Modals
  const cMinorScale = ['C1', 'Eb1', 'F1', 'G1', 'Bb1', 'C2', 'Eb2', 'F2', 'G2', 'Bb2', 'C3', 'Eb3', 'F3', 'G3', 'Bb3', 'C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5'];
  const chordsList = ['Cmin', 'Ebmaj', 'Fmin', 'Gmin', 'Bbmaj'];

  function getNotesForChord(chordName) {
    const map = {
      'Cmin': ['C3', 'Eb3', 'G3'],
      'Ebmaj': ['Eb3', 'G3', 'Bb3'],
      'Fmin': ['F3', 'Ab3', 'C4'],
      'Gmin': ['G3', 'Bb3', 'D4'],
      'Bbmaj': ['Bb3', 'D4', 'F4']
    };
    return map[chordName] || map['Cmin'];
  }

  function showNoteSelector(x, y, track, stepIndex) {
    const backdrop = document.createElement('div');
    backdrop.className = 'popover-backdrop';
    document.body.appendChild(backdrop);

    const popover = document.createElement('div');
    popover.className = 'note-selector-popover';
    popover.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    popover.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

    popover.innerHTML = `<div class="note-selector-popover-title">Select ${track.id === 'pad' ? 'Chord' : 'Note'}</div>`;

    if (track.notes) {
      let startIdx = track.id === 'bass' ? 0 : 10;
      const opts = cMinorScale.slice(startIdx, startIdx + 8);
      const grid = document.createElement('div');
      grid.className = 'note-grid';
      opts.forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'note-btn' + (track.notes[stepIndex] === opt ? ' active' : '');
        btn.innerText = opt;
        btn.addEventListener('click', () => {
          socket.emit('update-note', { trackId: track.id, stepIndex, note: opt });
          cleanup();
        });
        grid.appendChild(btn);
      });
      popover.appendChild(grid);
    } else if (track.chords) {
      const grid = document.createElement('div');
      grid.className = 'chord-grid';
      chordsList.forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'note-btn' + (track.chords[stepIndex] === opt ? ' active' : '');
        btn.innerText = opt;
        btn.addEventListener('click', () => {
          socket.emit('update-note', { trackId: track.id, stepIndex, note: opt });
          cleanup();
        });
        grid.appendChild(btn);
      });
      popover.appendChild(grid);
    }

    document.body.appendChild(popover);

    const cleanup = () => {
      document.body.removeChild(popover);
      document.body.removeChild(backdrop);
    };
    backdrop.addEventListener('click', cleanup);
  }

  // Recording & WAV Export
  recordBtn.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  function startRecording() {
    if (!audioContextInitialized) return;
    
    isRecording = true;
    leftChannel = [];
    rightChannel = [];
    
    if (!recorderNode) {
      recorderNode = Tone.context.rawContext.createScriptProcessor(4096, 2, 2);
      recorderNode.onaudioprocess = function(e) {
        if (!isRecording) {
          e.outputBuffer.getChannelData(0).fill(0);
          e.outputBuffer.getChannelData(1).fill(0);
          return;
        }
        
        leftChannel.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        rightChannel.push(new Float32Array(e.inputBuffer.getChannelData(1)));
        
        e.outputBuffer.getChannelData(0).fill(0);
        e.outputBuffer.getChannelData(1).fill(0);
      };
      masterVolume.connect(recorderNode);
      recorderNode.connect(Tone.context.rawContext.destination);
    }

    recordBtn.classList.add('recording');
    recordBtn.querySelector('span:nth-child(2)').innerText = 'Stop Recording';
    recordingStatusBar.classList.add('visible');
    wavDownloadBtn.style.display = 'none';
    
    recordingStart = Date.now();
    recordingDuration.innerText = `00:00`;
    recordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      recordingDuration.innerText = `${m}:${s}`;
    }, 1000);
  }

  function stopRecording() {
    isRecording = false;
    clearInterval(recordingTimer);
    
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('span:nth-child(2)').innerText = 'Record Studio Output';
    
    compileAndDownloadWAV();
  }

  function compileAndDownloadWAV() {
    recordingDuration.innerText = "Compiling WAV...";
    
    setTimeout(() => {
      const leftBuffer = mergeBuffers(leftChannel);
      const rightBuffer = mergeBuffers(rightChannel);
      
      const audioCtx = Tone.context.rawContext;
      const finalBuffer = audioCtx.createBuffer(2, leftBuffer.length, audioCtx.sampleRate);
      finalBuffer.copyToChannel(leftBuffer, 0);
      finalBuffer.copyToChannel(rightBuffer, 1);
      
      const wavBlob = bufferToWav(finalBuffer);
      const url = URL.createObjectURL(wavBlob);
      
      recordingDuration.innerText = "Ready!";
      wavDownloadBtn.style.display = 'flex';
      wavDownloadBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `beatroom-session-${new Date().getTime()}.wav`;
        a.click();
      };
    }, 100);
  }

  function mergeBuffers(channelBuffer) {
    let result = new Float32Array(channelBuffer.reduce((acc, val) => acc + val.length, 0));
    let offset = 0;
    for (let i = 0; i < channelBuffer.length; i++) {
        result.set(channelBuffer[i], offset);
        offset += channelBuffer[i].length;
    }
    return result;
  }

  function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let offset = 0;
    let pos = 0;

    setUint32(0x46464952); 
    setUint32(length - 8); 
    setUint32(0x45564157); 

    setUint32(0x20746d66); 
    setUint32(16);         
    setUint16(1);          
    setUint16(numOfChan);  
    setUint32(buffer.sampleRate); 
    setUint32(buffer.sampleRate * 2 * numOfChan); 
    setUint16(numOfChan * 2); 
    setUint16(16);         

    setUint32(0x61746164); 
    setUint32(length - pos - 4); 

    for(let i=0; i<numOfChan; i++) channels.push(buffer.getChannelData(i));

    while(pos < length) {
        for(let i=0; i<numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset])); 
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); 
            view.setInt16(pos, sample, true);          
            pos += 2;
        }
        offset++;
    }

    return new Blob([bufferArr], {type: "audio/wav"});

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
  }

  // Theme Toggle Logic
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  
  function updateThemeUI(isLight) {
    if (isLight) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    }
  }

  if (themeToggleBtn) {
    // Init from local storage
    const savedTheme = localStorage.getItem('beatroom-theme');
    let isLightMode = savedTheme === 'light';
    updateThemeUI(isLightMode);

    themeToggleBtn.addEventListener('click', () => {
      isLightMode = !isLightMode;
      localStorage.setItem('beatroom-theme', isLightMode ? 'light' : 'dark');
      updateThemeUI(isLightMode);
    });
  }

});
