const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Room states dictionary
// Key: roomId, Value: Room object
const rooms = {};

// Helper to initialize a room
function createInitialRoomState(roomId) {
  return {
    id: roomId,
    bpm: 120,
    isPlaying: false,
    playbackStartedServerTime: null,
    playbackStartStep: 0,
    users: {}, // socket.id -> { username, color }
    tracks: [
      { id: 'kick', name: 'Kick', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'kick-808', knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
      { id: 'snare', name: 'Snare', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'snare-analog', knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
      { id: 'hihat', name: 'Hi-Hat', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'hat-closed', knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
      { id: 'bass', name: 'Bass', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'bass-sub', notes: Array(16).fill('C2'), knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
      { id: 'synth', name: 'Synth', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'synth-lead', notes: Array(16).fill('C4'), knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
      { id: 'pad', name: 'Pad', owner: null, ownerName: null, steps: Array(16).fill(false), sample: 'pad-ambient', chords: Array(16).fill('Cmin'), knobs: { reverb: 0, delay: 0, volume: 1.0, pan: 0 } },
    ]
  };
}

// Socket communication
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUsername = null;

  // 1. Clock Synchronization (NTP-style responder)
  socket.on('sync-ping', (clientTime) => {
    socket.emit('sync-pong', {
      clientTime,
      serverTime: Date.now()
    });
  });

  // 2. Join Room
  socket.on('join-room', ({ roomId, username }) => {
    // Sanitize inputs
    const roomName = (roomId || 'default').trim().toLowerCase();
    const user = (username || 'Anonymous').trim();

    currentRoomId = roomName;
    currentUsername = user;

    // Join room channel
    socket.join(roomName);

    // Initialize room state if it doesn't exist
    if (!rooms[roomName]) {
      rooms[roomName] = createInitialRoomState(roomName);
    }

    const room = rooms[roomName];
    
    // Add user to presence list
    const userColors = ['#FF5F7E', '#00F5FF', '#BD57FA', '#FFB319', '#00FF87', '#8A9AEC', '#FF6B6B', '#4D96FF'];
    const color = userColors[Object.keys(room.users).length % userColors.length];
    room.users[socket.id] = { username: user, color };

    // Send the full current room state to the newly joined client
    socket.emit('room-state', {
      bpm: room.bpm,
      isPlaying: room.isPlaying,
      playbackStartedServerTime: room.playbackStartedServerTime,
      playbackStartStep: room.playbackStartStep,
      tracks: room.tracks,
      users: room.users
    });

    // Notify others in room
    socket.to(roomName).emit('user-joined', {
      id: socket.id,
      username: user,
      color,
      users: room.users
    });

    // Send a system message to chat
    io.to(roomName).emit('chat-message', {
      username: 'System',
      text: `${user} joined the studio.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      system: true
    });
    
    // Log room names to help dashboard lists
    updatePublicRooms();
  });

  // 3. Claim Track
  socket.on('claim-track', (trackId) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    if (track) {
      // Check if it's already owned
      if (track.owner === null || track.owner === socket.id) {
        // First release any other track this user owned
        room.tracks.forEach(t => {
          if (t.owner === socket.id && t.id !== trackId) {
            t.owner = null;
            t.ownerName = null;
            io.to(currentRoomId).emit('track-released', { trackId: t.id });
          }
        });

        // Set ownership
        track.owner = socket.id;
        track.ownerName = currentUsername;

        io.to(currentRoomId).emit('track-claimed', {
          trackId,
          owner: socket.id,
          ownerName: currentUsername
        });
      }
    }
  });

  // 4. Release Track
  socket.on('release-track', (trackId) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    if (track && track.owner === socket.id) {
      track.owner = null;
      track.ownerName = null;

      io.to(currentRoomId).emit('track-released', { trackId });
    }
  });

  // 5. Toggle Sequencer Step
  socket.on('toggle-step', ({ trackId, stepIndex, state }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    // Verify ownership
    if (track && track.owner === socket.id) {
      track.steps[stepIndex] = state;
      io.to(currentRoomId).emit('step-toggled', {
        trackId,
        stepIndex,
        state
      });
    }
  });

  // 6. Update Melodic Note (for Bass, Synth, Pad)
  socket.on('update-note', ({ trackId, stepIndex, note }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    // Verify ownership
    if (track && track.owner === socket.id) {
      if (track.notes) {
        track.notes[stepIndex] = note;
      } else if (track.chords) {
        track.chords[stepIndex] = note;
      }
      io.to(currentRoomId).emit('note-updated', {
        trackId,
        stepIndex,
        note
      });
    }
  });

  // 7. Update Track Knobs
  socket.on('update-knob', ({ trackId, knob, value }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    if (track && track.owner === socket.id) {
      track.knobs[knob] = value;
      socket.to(currentRoomId).emit('knob-updated', {
        trackId,
        knob,
        value
      });
    }
  });

  // 8. Update Track Sample / Sound Preset
  socket.on('update-sample', ({ trackId, sampleId }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const track = room.tracks.find(t => t.id === trackId);

    if (track && track.owner === socket.id) {
      track.sample = sampleId;
      io.to(currentRoomId).emit('sample-updated', {
        trackId,
        sampleId
      });
    }
  });

  // 9. Transport Play
  socket.on('transport-play', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (!room.isPlaying) {
      room.isPlaying = true;
      // Start in 300ms to allow network latency calibration on all clients
      const delay = 300;
      room.playbackStartedServerTime = Date.now() + delay;
      // Start from the current pause position (or 0)
      io.to(currentRoomId).emit('transport-start', {
        startTime: room.playbackStartedServerTime,
        startStep: room.playbackStartStep
      });
    }
  });

  // 10. Transport Pause
  socket.on('transport-pause', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (room.isPlaying) {
      // Calculate where we are
      const elapsedMs = Date.now() - room.playbackStartedServerTime;
      const msPerBeat = 60000 / room.bpm;
      const msPerStep = msPerBeat / 4; // 16th notes
      const stepsElapsed = elapsedMs / msPerStep;

      room.isPlaying = false;
      room.playbackStartStep = (room.playbackStartStep + Math.floor(stepsElapsed)) % 16;
      room.playbackStartedServerTime = null;

      io.to(currentRoomId).emit('transport-pause', {
        startStep: room.playbackStartStep
      });
    }
  });

  // 11. Transport Stop
  socket.on('transport-stop', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    room.isPlaying = false;
    room.playbackStartStep = 0;
    room.playbackStartedServerTime = null;

    io.to(currentRoomId).emit('transport-stop');
  });

  // 12. Change BPM
  socket.on('change-bpm', (bpm) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const newBpm = Math.max(40, Math.min(240, bpm));

    if (room.isPlaying) {
      // Recalculate playback position before changing tempo
      const elapsedMs = Date.now() - room.playbackStartedServerTime;
      const msPerBeat = 60000 / room.bpm;
      const msPerStep = msPerBeat / 4;
      const stepsElapsed = elapsedMs / msPerStep;

      // Update to new BPM reference starting now
      room.playbackStartStep = (room.playbackStartStep + Math.floor(stepsElapsed)) % 16;
      // Subtract the fractional part of the step to preserve step alignment
      const fractionOfStep = stepsElapsed - Math.floor(stepsElapsed);
      const newMsPerBeat = 60000 / newBpm;
      const newMsPerStep = newMsPerBeat / 4;
      const offsetMs = fractionOfStep * newMsPerStep;

      room.bpm = newBpm;
      room.playbackStartedServerTime = Date.now() - offsetMs;
      
      io.to(currentRoomId).emit('bpm-changed', {
        bpm: newBpm,
        playbackStartedServerTime: room.playbackStartedServerTime,
        playbackStartStep: room.playbackStartStep
      });
    } else {
      room.bpm = newBpm;
      io.to(currentRoomId).emit('bpm-changed', {
        bpm: newBpm,
        playbackStartedServerTime: null,
        playbackStartStep: room.playbackStartStep
      });
    }
  });

  // 13. Chat messages
  socket.on('chat-message', (text) => {
    if (!currentRoomId || !currentUsername) return;
    io.to(currentRoomId).emit('chat-message', {
      username: currentUsername,
      text: text.trim().substring(0, 200), // safety cutoff
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 14. Disconnect handling
  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      
      // Clean up track ownership
      room.tracks.forEach(track => {
        if (track.owner === socket.id) {
          track.owner = null;
          track.ownerName = null;
          io.to(currentRoomId).emit('track-released', { trackId: track.id });
        }
      });

      // Remove from users list
      if (room.users[socket.id]) {
        delete room.users[socket.id];
      }

      // Notify others in room
      io.to(currentRoomId).emit('user-left', {
        id: socket.id,
        username: currentUsername,
        users: room.users
      });

      // System notification in chat
      io.to(currentRoomId).emit('chat-message', {
        username: 'System',
        text: `${currentUsername} left the studio.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        system: true
      });

      // Clean up empty rooms (except default)
      if (Object.keys(room.users).length === 0 && currentRoomId !== 'default') {
        delete rooms[currentRoomId];
      }

      updatePublicRooms();
    }
  });
});

// Broadcast list of active public rooms to everyone on connect or room changes
function updatePublicRooms() {
  const activeRooms = Object.keys(rooms).map(id => ({
    id,
    userCount: Object.keys(rooms[id].users).length
  }));
  io.emit('public-rooms-list', activeRooms);
}

// Initial endpoint to get room list via HTTP before joining sockets
app.get('/api/rooms', (req, res) => {
  const activeRooms = Object.keys(rooms).map(id => ({
    id,
    userCount: Object.keys(rooms[id].users).length
  }));
  res.json(activeRooms);
});

server.listen(PORT, () => {
  console.log(`BeatRoom server running on http://localhost:${PORT}`);
});
