/**
 * PROTOCOLE HORIZON - Main Logic
 * Handling state, routing, and puzzle progression
 */

const STATE_KEY = 'protocole_horizon_state';

// --- IMMERSION ENGINE (Audio & Haptics) ---
const AudioEngine = {
    ctx: null,
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    play(type) {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;
        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'success') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    }
};

function triggerHaptic(type) {
    if ("vibrate" in navigator) {
        if (type === 'light') navigator.vibrate(20);
        if (type === 'medium') navigator.vibrate(50);
        if (type === 'error') navigator.vibrate([50, 50, 50]);
        if (type === 'success') navigator.vibrate([100, 50, 100]);
    }
}

// --- INITIAL STATE ---
let state = {
    group: null,
    currentStep: 0, // 0 to 8
    responses: {},
    notes: {},
    startTime: null,
    isDemoMode: false,
    isAdmin: false
};

// --- DATA: The 9 Puzzles ---
const PUZZLES = [
    { id: 1, title: "SVT - La biodiversité locale", discipline: "SVT", tool: "camera", instruction: "Identifie l'arbre marqué. Compte le nombre de lobes sur une feuille.", question: "Nombre de lobes = A", validation: (val) => val > 0 },
    { id: 2, title: "PC - Propagation de la lumière", discipline: "Physique-Chimie", tool: "crossMath", instruction: "Mesure l'ombre du poteau. Divise la longueur par 2.", question: "Résultat arrondi = B", validation: (val) => val > 0 },
    { id: 3, title: "PC - Masse volumique", discipline: "Physique-Chimie", tool: "input", instruction: "Mesure la masse de 125 mL d'eau.", question: "Chiffre des dizaines = C", validation: (val) => val >= 0 },
    { id: 4, title: "SVT - Effort physique", discipline: "SVT", tool: "bpm", instruction: "Cours 100m. Prends ton pouls sur 15s.", question: "Premier chiffre du BPM = D", validation: (val) => val >= 0 },
    { id: 5, title: "PC - Spectre de la lumière", discipline: "Physique-Chimie", tool: "spectrum", instruction: "Observe le spectre du soleil. Quelle couleur est la plus déviée ?", question: "Chiffre de la couleur = E", validation: (val) => val >= 0 },
    { id: 6, title: "SVT - Érosion et Géologie", discipline: "SVT", tool: "input", instruction: "Trouve l'inclusion minérale. Sédimentaire(1), Magmatique(2), Métamorphique(3).", question: "Chiffre associé = F", validation: (val) => [1, 2, 3].includes(parseInt(val)) },
    { id: 7, title: "PC - Concentration en masse", discipline: "Physique-Chimie", tool: "input", instruction: "Compare le tube Inconnu X avec les témoins.", question: "Numéro du tube témoin = G", validation: (val) => val > 0 },
    { id: 8, title: "PC - Caractéristique d'un son", discipline: "Physique-Chimie", tool: "audio", instruction: "Utilise le diapason. Quel son est le plus aigu ? A(4) ou B(8).", question: "Chiffre choisi = H", validation: (val) => [4, 8].includes(parseInt(val)) },
    { id: 9, title: "SVT - Agrosystème et Sol", discipline: "SVT", tool: "geo", instruction: "Mesure la température du sol à l'ombre.", question: "Chiffre des unités = I", validation: (val) => val >= 0 }
];

// --- CORE UTILS ---

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
        state = { ...state, ...JSON.parse(saved) };
    }
    
    // Check URL for admin mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        state.isAdmin = true;
    }
}

function getPuzzleId(group, step) {
    // Carousel formula: Énigme_Affichée = ((Numéro_Groupe - 1 + Étape_Actuelle) % 9) + 1
    return ((group - 1 + step) % 9) + 1;
}

// --- VIEW RADI RENDERING ---

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    if (state.isAdmin) {
        renderAdmin(app);
        return;
    }

    if (!state.group) {
        renderHome(app);
    } else if (state.currentStep >= 9) {
        renderFinal(app);
    } else {
        renderPuzzle(app);
    }
}

// --- VIEWS ---

function renderHome(container) {
    const view = document.createElement('div');
    view.className = 'view-container';
    view.innerHTML = `
        <div class="hero">
            <h1>PROTOCOLE HORIZON</h1>
            <p>Mission d'exploration scientifique</p>
        </div>
        <div class="card">
            <div class="input-group">
                <label for="group-select">Choisis ton groupe :</label>
                <select id="group-select">
                    <option value="" disabled selected>Sélectionner...</option>
                    ${[1,2,3,4,5,6,7,8,9].map(i => `<option value="${i}">Groupe ${i}</option>`).join('')}
                </select>
            </div>
            <button id="start-btn" class="primary" disabled>DÉMARRER LA MISSION</button>
        </div>
    `;

    container.appendChild(view);

    const select = view.querySelector('#group-select');
    const startBtn = view.querySelector('#start-btn');

    select.addEventListener('change', () => {
        startBtn.disabled = !select.value;
    });

    startBtn.addEventListener('click', () => {
        AudioEngine.play('click');
        triggerHaptic('medium');
        state.group = parseInt(select.value);
        state.startTime = Date.now();
        saveState();
        render();
    });
}

function renderPuzzle(container) {
    const puzzleId = getPuzzleId(state.group, state.currentStep);
    const puzzle = PUZZLES.find(p => p.id === puzzleId);

    const view = document.createElement('div');
    view.className = 'view-container';
    
    // Header
    const header = document.createElement('div');
    header.className = 'enigme-header';
    header.innerHTML = `
        <div class="badge">Étape ${state.currentStep + 1} / 9</div>
        <div class="chrono" id="global-chrono">00:00</div>
    `;
    view.appendChild(header);

    // Puzzle Content
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <h2>${puzzle.title}</h2>
        <p style="margin: 1rem 0; color: var(--text-muted);">${puzzle.instruction}</p>
        
        <div id="tool-container" class="tool-area">
            <!-- Tool will be injected here -->
            <p>Chargement de l'outil ${puzzle.tool}...</p>
        </div>

        <div class="input-group">
            <label>Bloc-notes :</label>
            <textarea id="puzzle-notes" placeholder="Tes observations...">${state.notes[puzzleId] || ''}</textarea>
        </div>

        <div class="input-group">
            <label>${puzzle.question}</label>
            <input type="number" id="puzzle-response" placeholder="Ta réponse..." value="${state.responses[puzzleId] || ''}">
        </div>

        <button id="next-btn" class="primary">VALIDER ET CONTINUER</button>
    `;
    view.appendChild(card);
    container.appendChild(view);

    // Initialize Chrono
    updateChrono();
    const chronoInterval = setInterval(updateChrono, 1000);

    // Inject Tool
    const toolContainer = view.querySelector('#tool-container');
    loadTool(puzzle.tool, toolContainer, puzzleId);

    // Event Listeners
    const nextBtn = view.querySelector('#next-btn');
    const responseInput = view.querySelector('#puzzle-response');
    const notesInput = view.querySelector('#puzzle-notes');

    nextBtn.addEventListener('click', () => {
        const val = responseInput.value;
        if (puzzle.validation(val) || state.isDemoMode) {
            AudioEngine.play('success');
            triggerHaptic('success');
            state.responses[puzzleId] = val || (state.isDemoMode ? "DEMO" : "");
            state.notes[puzzleId] = notesInput.value;
            state.currentStep++;
            clearInterval(chronoInterval);
            saveState();
            syncWithBackend(state.group, puzzleId, state.responses[puzzleId], state.notes[puzzleId]);
            render();
        } else {
            AudioEngine.play('error');
            triggerHaptic('error');
            alert("Réponse non valide. Vérifie tes mesures !");
        }
    });

    function updateChrono() {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        const chronoElem = document.getElementById('global-chrono');
        if (chronoElem) chronoElem.innerText = `${mins}:${secs}`;
    }
}

/**
 * Fonction de synchronisation avec le script Google Apps (GAS)
 */
function syncWithBackend(group, puzzleId, value, notes) {
    console.log(`Syncing Group ${group}, Puzzle ${puzzleId}: ${value}`);
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler(() => console.log("Sauvegarde GAS réussie"))
            .withFailureHandler((err) => console.error("Erreur GAS:", err))
            .enregistrerReponse(group, puzzleId, value, notes);
    } else {
        const logs = JSON.parse(localStorage.getItem('gas_mock_logs') || '[]');
        logs.push({ date: new Date(), group: "Groupe " + group, enigme: "E" + puzzleId, valeur: value, notes: notes });
        localStorage.setItem('gas_mock_logs', JSON.stringify(logs));
    }
}

function renderFinal(container) {
    const view = document.createElement('div');
    view.className = 'view-container';
    view.innerHTML = `
        <div class="hero">
            <h1>MISSION ACCOMPLIE</h1>
            <p>Vous avez récolté toutes les données !</p>
        </div>
        <div class="card" style="text-align: center;">
            <p style="font-size: 1.2rem; margin-bottom: 2rem;">
                Code de déverrouillage :<br>
                <strong style="font-size: 2.5rem; color: var(--success);">
                    ${state.responses[1] || '?'}${state.responses[2] || '?'}${state.responses[3] || '?'}
                </strong>
            </p>
            <p>Rendez-vous au point final avec votre enseignant.</p>
            <button id="reset-btn" style="margin-top: 2rem; background: #eee; color: #666;">RECOMMENCER</button>
        </div>
    `;
    container.appendChild(view);

    view.querySelector('#reset-btn').addEventListener('click', () => {
        if(confirm("Réinitialiser toute la partie ?")) {
            localStorage.removeItem(STATE_KEY);
            window.location.reload();
        }
    });
}

function renderAdmin(container) {
    const view = document.createElement('div');
    view.className = 'view-container';
    view.innerHTML = `
        <div class="admin-header">
            <h2>Tableau de Bord Enseignant</h2>
            <div class="switch-container">
                <span>Mode Démo</span>
                <label class="switch">
                    <input type="checkbox" id="demo-switch" ${state.isDemoMode ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <div class="card admin-container">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>GRP</th>
                        ${[1,2,3,4,5,6,7,8,9].map(i => `<th>E${i}</th>`).join('')}
                    </tr>
                </thead>
                <tbody id="admin-tbody">
                    ${[1,2,3,4,5,6,7,8,9].map(g => `
                        <tr>
                            <td><strong>${g}</strong></td>
                            ${[1,2,3,4,5,6,7,8,9].map(s => `<td class="status-0" id="cell-${g}-${s}">-</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <button id="exit-admin" class="secondary">RETOURNER À L'APPLI</button>
        <button id="full-reset" style="margin-top: 1rem; background: #f8d7da; color: #721c24;">RESET TOTAL</button>
    `;

    container.appendChild(view);

    // Visualization of progress & responses (mocking multi-group backend)
    const logs = JSON.parse(localStorage.getItem('gas_mock_logs') || '[]');
    const latestData = {}; // key: "group-puzzleId", value: response
    logs.forEach(log => {
        const gNum = parseInt(log.group.replace("Groupe ", ""));
        const pId = parseInt(log.enigme.replace("E", ""));
        latestData[`${gNum}-${pId}`] = log.valeur;
    });

    // Merge current session data (if not yet synced)
    if (state.group) {
        for (const [pId, val] of Object.entries(state.responses)) {
            latestData[`${state.group}-${pId}`] = val;
        }
    }

    // Populate the table cells
    for(let g=1; g<=9; g++) {
        for(let pId=1; pId<=9; pId++) {
            const cell = view.querySelector(`#cell-${g}-${pId}`);
            if (!cell) continue;

            const val = latestData[`${g}-${pId}`];
            if (val) {
                const puzzle = PUZZLES.find(p => p.id === pId);
                const isCorrect = puzzle.validation(val);
                cell.className = isCorrect ? 'status-correct' : 'status-incorrect';
                cell.innerText = val;
                cell.title = `Réponse: ${val}`; // Tooltip
            } else if (state.group === g && pId === getPuzzleId(state.group, state.currentStep)) {
                // Focus on current step for the active group
                cell.className = 'status-1';
                cell.innerText = '...';
            }
        }
    }

    view.querySelector('#demo-switch').addEventListener('change', (e) => {
        state.isDemoMode = e.target.checked;
        saveState();
        alert(`Mode Démo ${state.isDemoMode ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
    });

    view.querySelector('#exit-admin').addEventListener('click', () => {
        state.isAdmin = false;
        const url = new URL(window.location);
        url.searchParams.delete('admin');
        window.history.replaceState({}, '', url);
        render();
    });

    view.querySelector('#full-reset').addEventListener('click', () => {
        if(confirm("REMETTRE À ZÉRO TOUS LES GROUPES ?")) {
            localStorage.clear();
            window.location.href = window.location.pathname;
        }
    });
}

// --- TOOLS LOADER ---

function loadTool(type, container, puzzleId) {
    container.innerHTML = '';
    
    switch(type) {
        case 'camera':
            container.innerHTML = `
                <div id="camera-box" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <video id="video-stream" style="width: 100%; border-radius: 8px; display: none;" autoplay playsinline></video>
                    <canvas id="canvas-photo" style="width: 100%; border-radius: 8px; background: #eee; min-height: 200px; display: block;"></canvas>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button id="open-cam" class="secondary" style="font-size: 0.9rem;">📸 Capture</button>
                        <button id="clear-draw" class="secondary" style="font-size: 0.9rem; background: #f8fafc; color: #4a5568;">EFFACER</button>
                    </div>
                    <p style="font-size: 0.8rem; margin-top: 0.5rem;">Dessine tes annotations au doigt !</p>
                </div>
            `;
            const video = container.querySelector('#video-stream');
            const canvas = container.querySelector('#canvas-photo');
            const ctx = canvas.getContext('2d');
            let stream = null;

            container.querySelector('#open-cam').addEventListener('click', async () => {
                const btn = container.querySelector('#open-cam');
                if (btn.innerText === "📸 Capture") {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                        video.style.display = 'block';
                        canvas.style.display = 'none';
                        video.srcObject = stream;
                        btn.innerText = "Saisir l'image";
                    } catch (e) {
                        alert("Erreur accès caméra !");
                    }
                } else {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0);
                    video.style.display = 'none';
                    canvas.style.display = 'block';
                    btn.innerText = "📸 Capture";
                    if(stream) stream.getTracks().forEach(t => t.stop());
                }
            });

            // Drawing logic
            let isDrawing = false;
            const startDraw = (e) => { isDrawing = true; draw(e); };
            const stopDraw = () => { isDrawing = false; ctx.beginPath(); };
            const draw = (e) => {
                if (!isDrawing) return;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#e67e22';
                ctx.lineTo(x * scaleX, y * scaleY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x * scaleX, y * scaleY);
            };
            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDraw);
            canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); });
            canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); });
            canvas.addEventListener('touchend', stopDraw);
            container.querySelector('#clear-draw').addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
            break;

        case 'crossMath':
            container.innerHTML = `
                <div style="background: #fff; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0; width: 100%;">
                    <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.5rem; align-items: center;">
                        <input type="number" id="m1" placeholder="3m" style="padding: 0.5rem; text-align: center;">
                        <span>&nbsp;➡&nbsp;</span>
                        <input type="number" id="m2" placeholder="Ombre (m)" style="padding: 0.5rem; text-align: center;">
                        <input type="number" value="1" readonly style="padding: 0.5rem; text-align: center; background: #f8fafc;">
                        <span>&nbsp;➡&nbsp;</span>
                        <input type="number" id="m-res" readonly placeholder="?" style="padding: 0.5rem; text-align: center; font-weight: 900; background: #e8f8f5;">
                    </div>
                    <p style="font-size: 0.8rem; margin-top: 1rem; color: #64748b;">Produit en croix automatique sur 1m</p>
                </div>
            `;
            const m1 = container.querySelector('#m1');
            const m2 = container.querySelector('#m2');
            const mr = container.querySelector('#m-res');
            const calc = () => { if(m1.value && m2.value) mr.value = (parseFloat(m2.value) / parseFloat(m1.value)).toFixed(2); };
            m1.oninput = calc; m2.oninput = calc;
            break;

        case 'bpm':
            container.innerHTML = `
                <div style="text-align: center; width: 100%;">
                    <div id="tap-trigger" class="tap-btn">TAP</div>
                    <div id="bpm-val" style="font-size: 2rem; font-weight: 900; color: #e74c3c; margin: 1rem 0;">-- BPM</div>
                    <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                        <div id="bpm-progress" style="width: 0%; height: 100%; background: #e74c3c; transition: width 0.2s;"></div>
                    </div>
                    <p id="bpm-hint" style="font-size: 0.8rem; margin-top: 0.5rem;">Tapez à chaque battement...</p>
                </div>
            `;
            const tapBtn = container.querySelector('#tap-trigger');
            const bpmVal = container.querySelector('#bpm-val');
            const progress = container.querySelector('#bpm-progress');
            let taps = [];
            
            tapBtn.addEventListener('click', () => {
                AudioEngine.play('click');
                triggerHaptic('light');
                const now = Date.now();
                taps.push(now);
                if (taps.length > 1) {
                    const diffs = [];
                    for(let i=1; i<taps.length; i++) diffs.push(taps[i] - taps[i-1]);
                    const avg = diffs.reduce((a,b)=>a+b)/diffs.length;
                    const bpm = Math.round(60000 / avg);
                    bpmVal.innerText = `${bpm} BPM`;
                    
                    const p = Math.min(100, taps.length * 10);
                    progress.style.width = `${p}%`;
                    if(taps.length >= 10) container.querySelector('#bpm-hint').innerText = "Rythme stabilisé !";
                }
            });
            break;

        case 'spectrum':
            container.innerHTML = `
                <div style="width: 100%; text-align: center;">
                    <div id="spectrum-box" style="background: linear-gradient(to right, #4b0082, #0000ff, #00ff00, #ffff00, #ffa500, #ff0000); height: 80px; width: 100%; border-radius: 12px; cursor: crosshair; margin-bottom: 1rem; position: relative;">
                        <div id="spectrum-picker" style="position: absolute; top:0; left: 50%; height: 100%; width: 4px; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: none;"></div>
                    </div>
                    <p id="spectro-result" style="font-size: 1.2rem; font-weight: 700;">Quelle couleur vois-tu ?</p>
                    <p style="font-size: 0.8rem; color: #64748b;">Clique sur la zone correspondante</p>
                </div>
            `;
            const box = container.querySelector('#spectrum-box');
            const picker = container.querySelector('#spectrum-picker');
            const res = container.querySelector('#spectro-result');
            const colors = ["Violet (7)", "Bleu (6)", "Vert (5)", "Jaune (?), non utilisé", "Orange (?)", "Rouge (?)"];
            const values = [7, 6, 5, 4, 3, 2];

            box.addEventListener('click', (e) => {
                const rect = box.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                picker.style.left = `${x}px`;
                picker.style.display = 'block';
                
                let idx = Math.floor(percent * 6);
                idx = Math.max(0, Math.min(5, idx));
                res.innerText = `Couleur : ${colors[idx]}`;
                res.style.color = '#1a202c';
            });
            break;

        case 'audio':
            container.innerHTML = `
                <div style="width: 100%; text-align: center;">
                    <canvas id="audio-fft" style="width: 100%; height: 100px; background: #1a202c; border-radius: 8px;"></canvas>
                    <p id="freq-val" style="margin: 1rem 0; font-weight: 900; font-size: 1.2rem;">-- Hz</p>
                    <button id="start-audio" class="secondary" style="font-size: 0.9rem;">DÉMARRER LE MICRO</button>
                    <div style="margin-top: 1rem; padding: 0.5rem; border-top: 1px solid #e2e8f0;">
                       <p style="font-size: 0.7rem; color: #64748b; margin-bottom: 0.5rem;">Trop complexe ?</p>
                       <a href="phyphox://" style="color: var(--accent-secondary); font-size: 0.8rem; font-weight: 700; text-decoration: none;">Ouvrir l'application Phyphox</a>
                    </div>
                </div>
            `;
            const audioCanvas = container.querySelector('#audio-fft');
            const freqVal = container.querySelector('#freq-val');
            const startAudio = container.querySelector('#start-audio');
            let audioCtx, analyzer, dataArray;

            startAudio.onclick = async () => {
                try {
                    const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioCtx.createMediaStreamSource(aStream);
                    analyzer = audioCtx.createAnalyser();
                    analyzer.fftSize = 2048;
                    source.connect(analyzer);
                    dataArray = new Uint8Array(analyzer.frequencyBinCount);
                    startAudio.style.display = 'none';
                    drawAudio();
                } catch(e) { alert("Micro non supporté."); }
            };

            function drawAudio() {
                if(!analyzer) return;
                requestAnimationFrame(drawAudio);
                analyzer.getByteFrequencyData(dataArray);
                const ctx = audioCanvas.getContext('2d');
                ctx.fillStyle = '#1a202c';
                ctx.fillRect(0, 0, audioCanvas.width, audioCanvas.height);
                
                let maxVal = 0, maxIdx = 0;
                const barWidth = (audioCanvas.width / dataArray.length) * 2.5;
                let x = 0;
                for(let i = 0; i < dataArray.length; i++) {
                    const barHeight = dataArray[i] / 2;
                    ctx.fillStyle = `rgb(${barHeight + 100}, 50, 200)`;
                    ctx.fillRect(x, audioCanvas.height - barHeight, barWidth, barHeight);
                    x += barWidth + 1;
                    if(dataArray[i] > maxVal) { maxVal = dataArray[i]; maxIdx = i; }
                }
                const freq = maxIdx * audioCtx.sampleRate / analyzer.fftSize;
                if(maxVal > 50) freqVal.innerText = `${Math.round(freq)} Hz`;
            }
            break;

        case 'geo':
            container.innerHTML = `
                <div style="width: 100%; text-align: center;">
                    <div id="radar" style="width: 80px; height: 80px; border-radius: 50%; background: rgba(41, 128, 185, 0.1); border: 2px solid var(--accent-secondary); margin: 0 auto 1rem auto; display: flex; align-items: center; justify-content: center; position: relative;">
                        <div id="radar-pulse" style="width: 100%; height: 100%; background: var(--accent-secondary); border-radius: 50%; opacity: 0.2; animation: pulse 2s infinite;"></div>
                        <span style="position: absolute; font-size: 1.5rem;">📍</span>
                    </div>
                    <p id="dist-val" style="font-size: 1.5rem; font-weight: 900; color: var(--accent-secondary);">Recherche GPS...</p>
                    <p style="font-size: 0.8rem; color: #64748b;">Distance entre toi et le lieu d'arrivée</p>
                </div>
                <style>
                @keyframes pulse {
                    0% { transform: scale(0.5); opacity: 0.8; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
                </style>
            `;
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition((pos) => {
                    // Simulating a target point (e.g., middle of a courtyard)
                    // In real use, these would be the coordinates of the goal
                    const targetLat = pos.coords.latitude + 0.0001; 
                    const targetLng = pos.coords.longitude + 0.0001;
                    
                    const R = 6371e3; // metres
                    const phi1 = pos.coords.latitude * Math.PI/180;
                    const phi2 = targetLat * Math.PI/180;
                    const deltaPhi = (targetLat-pos.coords.latitude) * Math.PI/180;
                    const deltaLambda = (targetLng-pos.coords.longitude) * Math.PI/180;
                    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                             Math.cos(phi1) * Math.cos(phi2) *
                             Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const d = R * c;
                    container.querySelector('#dist-val').innerText = `${Math.round(d)} m`;
                }, () => { alert("Active le GPS !"); });
            }
            break;

        default:
            container.innerHTML = `<p>Saisie manuelle pour cette étape.</p>`;
    }
}

// --- INIT ---
loadState();
render();
