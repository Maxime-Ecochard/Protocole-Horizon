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

// --- DATA: The 10 Puzzles ---
const PUZZLES = [
    { id: 1, title: "SVT - Orientation Botanique", discipline: "SVT", tool: "compass", instruction: "Chercher la plante appelée « Rince-bouteille » située au sud-est dans la cour et noter le chiffre indiqué sur le mur à proximité.<br><br>Chercher la plante appelée « Rince-bouteille » située au sud-ouest dans la cour et noter le chiffre indiqué sur le mur à proximité.<br><img src=\"https://plantes-avenue.fr/25274-large_default/rince-bouteilles-silence-ca-pousse-.jpg\" style=\"width: 100%; border-radius: 12px; margin-top: 1rem;\">", question: "Produit des deux chiffres trouvés = A", validation: (val) => parseInt(val) === 6 },
    { id: 2, title: "SVT - Platanes et Palmier", discipline: "SVT", tool: "camera", instruction: "Combien y a-t-il de platanes dans la cour ?<br><br>Dans un platane, une graine de palmier a germé ! Trouve le palmier caché et prends-le en photo.<br><small>(Indice : le platane est près de la cantine, ouvre les yeux !)</small>", question: "Nombre de platanes = B", validation: (val) => parseInt(val) === 5 },
    { id: 3, title: "PC - Mesure d'ombre (Thalès)", discipline: "Physique-Chimie", tool: "crossMath", instruction: "Complète le tableau de proportionnalité pour déterminer la taille réelle du panier de basket.", question: "Chiffre des unités de la taille (en cm) = C", validation: (val) => val > 0 },
    { id: 4, title: "PC - Masse volumique", discipline: "Physique-Chimie", tool: "density", instruction: "Pèse le bécher vide, puis l'eau. Utilise la Tare si nécessaire.", question: "Chiffre des dizaines en <strong>g</strong> = D", validation: (val) => val >= 0 },
    { id: 5, title: "SVT - Fréquence Cardiaque", discipline: "SVT", tool: "bpm", instruction: "Mesure ta fréquence cardiaque au repos. Clique sur TAP pour démarrer le chrono de 30s.", question: "Quel est le chiffre des centaines du BPM ? = E", validation: (val) => val >= 0 },
    { id: 6, title: "PC - Couleur des tables", discipline: "Physique-Chimie", tool: "spectrum", instruction: "Quelle est la longueur d'onde dominante des tables de la cour ?", question: "Chiffre associé = F", validation: (val) => val >= 0 },
    { id: 7, title: "PC - Concentration en masse", discipline: "Physique-Chimie", tool: "concentration", instruction: "Compare le tube Inconnu X avec les témoins en le superposant.", question: "Numéro du tube témoin = G", validation: (val) => parseInt(val) === 4 },
    { id: 8, title: "PC - Caractéristique d'un son", discipline: "Physique-Chimie", tool: "audio", instruction: "Utilise le diapason. Quel son est le plus aigu ?", question: "Le son le plus aigu correspond au Cas n° (1 ou 2) = H", validation: (val) => [1, 2].includes(parseInt(val)) },
    { id: 9, title: "SVT - Espèce Invasive", discipline: "SVT", tool: "ailante", instruction: "Trouve l'Ailante (Faux-vernis du Japon) près de la cafétéria. Prends une photo et identifie les folioles.", question: "Elle pousse entre 2 blocs de béton ? (vrai / faux) = I", validation: (val) => val.toLowerCase() === "vrai" },
    { id: 10, title: "SVT - La Photosynthèse", discipline: "SVT", tool: "photosynthesis", instruction: "Découvre les secrets de la photosynthèse.", question: "Combien y a-t-il de lettres dans le nom de cet organite ? = J", validation: (val) => parseInt(val) === 12 }
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
    // Carousel formula: Énigme_Affichée = ((Numéro_Groupe - 1 + Étape_Actuelle) % 10) + 1
    return ((group - 1 + step) % 10) + 1;
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
    } else if (state.currentStep >= 10) {
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
        <div class="badge">Étape ${state.currentStep + 1} / 10</div>
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

        ${puzzle.id === 8 ? `
            <div style="width: 100%; display: flex; flex-direction: column; gap: 0.75rem; margin: 1rem 0 2rem 0;">
                <div class="card" style="margin: 0; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); padding: 1rem; border-radius: 12px;">
                    <h4 style="color: var(--accent-secondary); font-size: 0.9rem; margin-bottom: 0.2rem;">CAS N°1</h4>
                    <p style="font-size: 0.85rem;">Le son produit par le diapason A est grave et vibre lentement.</p>
                </div>
                <div class="card" style="margin: 0; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); padding: 1rem; border-radius: 12px;">
                    <h4 style="color: var(--accent-secondary); font-size: 0.9rem; margin-bottom: 0.2rem;">CAS N°2</h4>
                    <p style="font-size: 0.85rem;">Le son produit par le diapason B est aigu et vibre rapidement.</p>
                </div>
            </div>
        ` : ''}

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
                    ${state.responses[1] || '?'}${state.responses[2] || '?'}${state.responses[3] || '?'}${state.responses[4] || '?'}
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
    const app = document.getElementById('app');
    app.classList.add('admin-mode');
    
    container.innerHTML = `
        <div class="admin-header">
            <div>
                <h2 style="background: linear-gradient(90deg, #fff, var(--accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">CONSOLE ENSEIGNANT</h2>
                <p style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;">Suivi des missions en temps réel</p>
            </div>
            <div class="switch-container">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">MODE DÉMO</span>
                <label class="switch">
                    <input type="checkbox" id="demo-switch" ${state.isDemoMode ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <div class="card" style="padding: 0.5rem; background: rgba(15, 23, 42, 0.2); border: 1px solid rgba(255,255,255,0.05);">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">GRP</th>
                        ${[1,2,3,4,5,6,7,8,9,10].map(i => `<th>E${i}</th>`).join('')}
                    </tr>
                </thead>
                <tbody id="admin-tbody">
                    ${[1,2,3,4,5,6,7,8,9].map(g => `
                        <tr>
                            <td style="background: rgba(30, 41, 59, 1); color: #fff; font-weight: 900; border-radius: 6px;">${g}</td>
                            ${[1,2,3,4,5,6,7,8,9,10].map(s => `<td class="status-0" id="cell-${g}-${s}">-</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
            <button id="exit-admin" class="secondary" style="flex: 1;">RETOURNER À L'APPLI</button>
            <button id="full-reset" style="flex: 1; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--error); color: var(--error);">RÉINITIALISER TOUT</button>
        </div>
    `;

    // Visualization logic

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
        for(let pId=1; pId<=10; pId++) {
            const cell = view.querySelector(`#cell-${g}-${pId}`);
            if (!cell) continue;

            const val = latestData[`${g}-${pId}`];
            const logsForThis = logs.find(l => parseInt(l.group.replace("Groupe ", "")) === g && parseInt(l.enigme.replace("E", "")) === pId);
            const notes = logsForThis ? (logsForThis.notes || "Pas de notes") : "";

            if (val) {
                const puzzle = PUZZLES.find(p => p.id === pId);
                const isCorrect = puzzle.validation(val);
                cell.className = isCorrect ? 'status-correct' : 'status-incorrect';
                cell.innerText = isCorrect ? "✔️ " + val : "❌ " + val;
                cell.title = `Réponse: ${val}\nNotes: ${notes}`; 
            } else if (state.group === g && pId === getPuzzleId(state.group, state.currentStep)) {
                cell.className = 'status-1';
                cell.innerText = '⏳';
                cell.title = 'Mission en cours...';
            }
        }
    }

    view.querySelector('#demo-switch').addEventListener('change', (e) => {
        state.isDemoMode = e.target.checked;
        saveState();
        triggerHaptic('medium');
    });

    view.querySelector('#exit-admin').addEventListener('click', () => {
        state.isAdmin = false;
        app.classList.remove('admin-mode');
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
                    <video id="video-stream" style="width: 100%; border-radius: 12px; display: none;" autoplay playsinline></video>
                    <canvas id="canvas-photo" style="width: 100%; border-radius: 12px; background: #0f172a; min-height: 200px; display: block; border: 1px solid rgba(255,255,255,0.1);"></canvas>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button id="open-cam" class="secondary" style="font-size: 0.85rem; padding: 0.75rem 1rem;">📸 Capture / Photo</button>
                        <button id="clear-draw" class="secondary" style="font-size: 0.85rem; background: rgba(255,255,255,0.05); color: #fff; padding: 0.75rem 1rem;">EFFACER</button>
                    </div>
                    <p style="font-size: 0.75rem; margin-top: 0.75rem; color: var(--text-muted);">Dessine tes annotations au doigt sur la photo !</p>
                </div>
            `;
            const video = container.querySelector('#video-stream');
            const canvas = container.querySelector('#canvas-photo');
            const ctx = canvas.getContext('2d');
            let stream = null;

            container.querySelector('#open-cam').addEventListener('click', async () => {
                const btn = container.querySelector('#open-cam');
                if (!stream) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ 
                            video: { facingMode: { exact: 'environment' } || 'environment' } 
                        });
                        video.style.display = 'block';
                        canvas.style.display = 'none';
                        video.srcObject = stream;
                        btn.innerText = "Saisir l'image";
                    } catch (e) {
                        try {
                            stream = await navigator.mediaDevices.getUserMedia({ video: true });
                            video.style.display = 'block';
                            canvas.style.display = 'none';
                            video.srcObject = stream;
                            btn.innerText = "Saisir l'image";
                        } catch (e2) {
                            alert("Erreur accès caméra.");
                        }
                    }
                } else {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0);
                    video.style.display = 'none';
                    canvas.style.display = 'block';
                    btn.innerText = "📸 Capture / Photo";
                    if(stream) stream.getTracks().forEach(t => t.stop());
                    stream = null;
                }
            });

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
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#f97316';
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

        case 'compass':
            container.innerHTML = `
                <div style="width: 100%; text-align: center; position: relative; padding-bottom: 2rem;">
                    <div id="compass-body" style="width: 160px; height: 160px; border-radius: 50%; border: 8px solid #1e293b; margin: 0 auto; position: relative; background: radial-gradient(circle, #334155 0%, #0f172a 100%); box-shadow: 0 0 30px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.1);">
                        <div id="needle" style="position: absolute; top: 50%; left: 50%; width: 6px; height: 100px; margin-top: -500px; margin-left: -3px; transition: transform 0.1s; transform-origin: center 50px; z-index: 2;">
                            <div style="width: 100%; height: 50px; background: #ef4444; border-radius: 3px 3px 0 0;"></div>
                            <div style="width: 100%; height: 50px; background: #e2e8f0; border-radius: 0 0 3px 3px;"></div>
                        </div>
                        <div id="needle" style="position: absolute; top: 50%; left: 50%; width: 6px; height: 100px; margin-top: -50px; margin-left: -3px; transition: transform 0.1s; transform-origin: center center; z-index: 2;">
                            <div style="width: 100%; height: 50%; background: #ef4444; border-radius: 3px 3px 0 0;"></div>
                            <div style="width: 100%; height: 50%; background: #e2e8f0; border-radius: 0 0 3px 3px;"></div>
                        </div>
                        <div style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-weight: 900; color: #fff; font-size: 0.8rem;">N</div>
                        <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); font-weight: 900; color: #fff; font-size: 0.8rem;">S</div>
                        <div style="position: absolute; top: 50%; left: 10px; transform: translateY(-50%); font-weight: 900; color: #fff; font-size: 0.8rem;">O</div>
                        <div style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); font-weight: 900; color: #fff; font-size: 0.8rem;">E</div>
                    </div>
                    <p id="compass-val" style="margin-top: 1.5rem; font-size: 1.2rem; font-weight: 900; color: var(--accent-secondary);">Orientation : --°</p>
                    <button id="btn-compass-init" class="secondary" style="font-size: 0.8rem; margin-top: 1rem; width: auto; padding: 0.75rem 1rem;">ACTIVER LA BOUSSOLE</button>
                </div>
            `;
            const needle = container.querySelector('#needle');
            const compVal = container.querySelector('#compass-val');
            const btnComp = container.querySelector('#btn-compass-init');

            btnComp.onclick = async () => {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    try {
                        const permission = await DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                             window.addEventListener('deviceorientation', handleOrientation, true);
                             btnComp.style.display = 'none';
                        }
                    } catch (e) { alert("Permission boussole refusée."); }
                } else {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
                    btnComp.style.display = 'none';
                }
            };

            function handleOrientation(e) {
                let heading = e.webkitCompassHeading || (360 - e.alpha);
                if (heading !== undefined && heading !== null) {
                    needle.style.transform = `rotate(${-heading}deg)`;
                    compVal.innerText = `Orientation : ${Math.round(heading)}°`;
                }
            }
            break;

        case 'density':
            container.innerHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem; align-items: center;">
                    <div style="width: 100%; display: flex; justify-content: space-around; align-items: flex-end; height: 160px; padding-bottom: 1rem;">
                        <!-- Balance -->
                        <div style="text-align: center;">
                            <div style="width: 80px; height: 10px; background: #475569; border-radius: 4px; margin: 0 auto;"></div>
                            <div id="scale-screen" style="width: 110px; height: 40px; background: #1e293b; border: 2px solid #334155; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--success); font-family: monospace; font-size: 1.1rem; font-weight: bold; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
                                <span id="scale-val">0.0</span><small style="font-size: 0.6rem; margin-left: 2px;">g</small>
                            </div>
                            <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">BALANCE</p>
                        </div>
                        <!-- Récipient -->
                        <div style="text-align: center; position: relative;">
                             <div id="vessel" style="width: 60px; height: 110px; border: 3px solid rgba(255,255,255,0.3); border-top: none; border-radius: 0 0 10px 10px; position: relative; margin: 0 auto; background: rgba(255,255,255,0.05); overflow: hidden; display: none;">
                                <div id="liquid" style="position: absolute; bottom: 0; width: 100%; height: 0%; background: rgba(59, 130, 246, 0.4); transition: height 0.8s ease-out;">
                                    <div style="position: absolute; top:0; width: 100%; height: 2px; background: rgba(255,255,255,0.5);"></div>
                                </div>
                                ${[100, 80, 60, 40, 20].map(v => `<div style="position: absolute; bottom: ${v}px; right: 0; width: 8px; height: 1px; background: rgba(255,255,255,0.2);"></div>`).join('')}
                             </div>
                             <div id="vessel-placeholder" style="width: 60px; height: 110px; border: 2px dashed rgba(255,255,255,0.1); border-radius: 10px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.1); font-size: 0.7rem;">VIDE</div>
                             <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">PLATEAU</p>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; width: 100%;">
                        <button id="btn-beaker" class="secondary" style="font-size: 0.8rem; padding: 0.75rem;">PESER BÉCHER</button>
                        <button id="btn-tare" class="secondary" style="font-size: 0.8rem; padding: 0.75rem;" disabled>TARE</button>
                        <button id="btn-water" class="secondary" style="font-size: 0.8rem; padding: 0.75rem;" disabled>PESER EAU</button>
                        <button id="btn-reset" class="secondary" style="font-size: 0.8rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-color: var(--error); color: var(--error);">RETIRER EAU</button>
                    </div>
                </div>
            `;
            const scaleVal = container.querySelector('#scale-val');
            const liquid = container.querySelector('#liquid');
            const vessel = container.querySelector('#vessel');
            const placeholder = container.querySelector('#vessel-placeholder');
            const btnB = container.querySelector('#btn-beaker');
            const btnT = container.querySelector('#btn-tare');
            const btnW = container.querySelector('#btn-water');
            const btnR = container.querySelector('#btn-reset');
            
            let beakerMass = 42.8; 
            let waterMass = 125.0;
            let currentTare = 0;

            btnB.onclick = () => {
                AudioEngine.play('click');
                vessel.style.display = 'block';
                placeholder.style.display = 'none';
                scaleVal.innerText = (beakerMass - currentTare).toFixed(1);
                btnB.disabled = true;
                btnT.disabled = false;
                btnW.disabled = false;
            };

            btnT.onclick = () => {
                AudioEngine.play('click');
                currentTare = beakerMass;
                scaleVal.innerText = "0.0";
                btnT.disabled = true;
            };

            btnW.onclick = () => {
                AudioEngine.play('click');
                liquid.style.height = "85%";
                const total = beakerMass + waterMass - currentTare;
                scaleVal.innerText = total.toFixed(1);
                btnW.disabled = true;
            };

            btnR.onclick = () => {
                AudioEngine.play('click');
                liquid.style.height = "0%";
                scaleVal.innerText = (beakerMass - currentTare).toFixed(1);
                btnW.disabled = false;
                if (liquid.style.height === "0%") {
                    vessel.style.display = 'none';
                    placeholder.style.display = 'flex';
                    scaleVal.innerText = "0.0";
                    currentTare = 0;
                    btnB.disabled = false;
                    btnT.disabled = true;
                    btnW.disabled = true;
                }
            };
            break;

        case 'crossMath':
            container.innerHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
                    <table class="cross-math-table">
                        <thead>
                            <tr>
                                <th>Objet</th>
                                <th>Taille réelle (m)</th>
                                <th>Ombre (m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="color: var(--accent-secondary); font-weight: 700;">Élève</td>
                                <td><input type="number" id="h-eleve" placeholder="ex: 1.65" step="0.01"></td>
                                <td><input type="number" id="o-eleve" placeholder="ex: 2.10" step="0.01"></td>
                            </tr>
                            <tr>
                                <td style="color: var(--accent-secondary); font-weight: 700;">Panier</td>
                                <td><div id="h-panier-res" style="font-weight: 900; color: var(--success); font-size: 1.2rem;">--</div></td>
                                <td><input type="number" id="o-panier" placeholder="ex: 4.50" step="0.01"></td>
                            </tr>
                        </tbody>
                    </table>
                    <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; font-style: italic;">Produit en croix : (Taille Élève × Ombre Panier) / Ombre Élève</p>
                </div>
            `;
            const hE = container.querySelector('#h-eleve');
            const oE = container.querySelector('#o-eleve');
            const oP = container.querySelector('#o-panier');
            const resH = container.querySelector('#h-panier-res');
            const updateCalc = () => {
                if (hE.value && oE.value && oP.value) {
                    const result = (parseFloat(hE.value) * parseFloat(oP.value)) / parseFloat(oE.value);
                    resH.innerText = result.toFixed(2) + " m";
                } else {
                    resH.innerText = "--";
                }
            };
            hE.oninput = updateCalc; oE.oninput = updateCalc; oP.oninput = updateCalc;
            break;

        case 'bpm':
            container.innerHTML = `
                <div style="text-align: center; width: 100%; position: relative;">
                    <div id="bpm-timer" style="position: absolute; top: -10px; right: 0; background: rgba(59, 130, 246, 0.2); padding: 4px 12px; border-radius: 20px; font-family: monospace; color: var(--accent-secondary); border: 1px solid var(--accent-secondary); font-weight: 800;">30.0s</div>
                    <div id="tap-trigger" class="tap-btn">TAP</div>
                    <div id="bpm-val" style="font-size: 2.5rem; font-weight: 900; color: #ef4444; margin: 1rem 0; text-shadow: 0 0 15px rgba(239, 68, 68, 0.4);">-- BPM</div>
                    <div style="width: 100%; background: rgba(255,255,255,0.1); height: 12px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                        <div id="bpm-progress" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ef4444, #f97316); transition: width 0.1s linear;"></div>
                    </div>
                    <p id="bpm-hint" style="font-size: 0.85rem; margin-top: 1rem; color: var(--text-muted);">Appuie sur TAP pour démarrer la mesure (30s)</p>
                </div>
            `;
            const tapBtn = container.querySelector('#tap-trigger');
            const bpmVal = container.querySelector('#bpm-val');
            const progress = container.querySelector('#bpm-progress');
            const timerDisplay = container.querySelector('#bpm-timer');
            let taps = [];
            let bpmStartTime = null;
            let bpmDuration = 30000; 
            let bpmTimerInterval = null;

            tapBtn.addEventListener('click', () => {
                AudioEngine.play('click');
                triggerHaptic('light');
                const now = Date.now();
                
                if (!bpmStartTime) {
                    bpmStartTime = now;
                    container.querySelector('#bpm-hint').innerText = "Continue à taper au rythme de ton cœur...";
                    bpmTimerInterval = setInterval(() => {
                        const elapsed = Date.now() - bpmStartTime;
                        const remaining = Math.max(0, (bpmDuration - elapsed) / 1000);
                        timerDisplay.innerText = remaining.toFixed(1) + "s";
                        progress.style.width = (elapsed / bpmDuration * 100) + "%";
                        
                        if (elapsed >= bpmDuration) {
                            clearInterval(bpmTimerInterval);
                            tapBtn.style.pointerEvents = 'none';
                            tapBtn.style.opacity = '0.3';
                            container.querySelector('#bpm-hint').innerHTML = "<span style='color:var(--success)'>Mesure terminée !</span>";
                        }
                    }, 100);
                }

                taps.push(now);
                if (taps.length > 1) {
                    const elapsedSinceStart = now - bpmStartTime;
                    const bpm = Math.round((taps.length / (elapsedSinceStart / 60000)));
                    bpmVal.innerText = `${bpm} BPM`;
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
            const colors = ["Violet", "Bleu", "Vert", "Jaune", "Orange", "Rouge"];
            const values = [1, 2, 3, 4, 5, 6];

            box.addEventListener('click', (e) => {
                const rect = box.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                picker.style.left = `${x}px`;
                picker.style.display = 'block';
                
                let idx = Math.floor(percent * 6);
                idx = Math.max(0, Math.min(5, idx));
                res.innerText = `${colors[idx]} (Valeur: ${values[idx]})`;
                res.style.color = '#fff';
            });
            break;

        case 'audio':
            container.innerHTML = `
                <div style="width: 100%; text-align: center;">
                    <canvas id="audio-fft" style="width: 100%; height: 100px; background: rgba(15, 23, 42, 0.6); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"></canvas>
                    <p id="freq-val" style="margin: 1rem 0; font-weight: 900; font-size: 1.5rem; color: var(--accent-primary);">-- Hz</p>
                    <button id="start-audio" class="secondary" style="font-size: 0.9rem; width: auto; margin: 0 auto;">DÉMARRER LE MICRO</button>
                    <div style="margin-top: 1rem; padding: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
                       <p style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.5rem;">Trop complexe ?</p>
                       <a href="phyphox://" style="color: var(--accent-secondary); font-size: 0.8rem; font-weight: 700; text-decoration: none;">Ouvrir l'application Phyphox</a>
                    </div>
                </div>
            `;
            const audioCanvas = container.querySelector('#audio-fft');
            const freqValText = container.querySelector('#freq-val');
            const startBtnAudio = container.querySelector('#start-audio');
            let analyzer, dataAr, aCtx;

            startBtnAudio.onclick = async () => {
                try {
                    const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    aCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const source = aCtx.createMediaStreamSource(aStream);
                    analyzer = aCtx.createAnalyser();
                    analyzer.fftSize = 2048;
                    source.connect(analyzer);
                    dataAr = new Uint8Array(analyzer.frequencyBinCount);
                    startBtnAudio.style.display = 'none';
                    drawAudioSpectrum();
                } catch(e) { alert("Micro non supporté."); }
            };

            function drawAudioSpectrum() {
                if(!analyzer) return;
                requestAnimationFrame(drawAudioSpectrum);
                analyzer.getByteFrequencyData(dataAr);
                const ctxAudio = audioCanvas.getContext('2d');
                ctxAudio.fillStyle = 'rgba(15, 23, 42, 1)';
                ctxAudio.fillRect(0, 0, audioCanvas.width, audioCanvas.height);
                
                let mVal = 0, mIdx = 0;
                const bW = (audioCanvas.width / dataAr.length) * 2.5;
                let curX = 0;
                for(let i = 0; i < dataAr.length; i++) {
                    const bH = dataAr[i] / 2;
                    ctxAudio.fillStyle = `rgb(59, 130, 246)`;
                    ctxAudio.fillRect(curX, audioCanvas.height - bH, bW, bH);
                    curX += bW + 1;
                    if(dataAr[i] > mVal) { mVal = dataAr[i]; mIdx = i; }
                }
                const freqActual = mIdx * aCtx.sampleRate / analyzer.fftSize;
                if(mVal > 50) freqValText.innerText = `${Math.round(freqActual)} Hz`;
            }
            break;

        case 'concentration':
            container.innerHTML = `
                <div style="width: 100%; text-align: center; position: relative;">
                    <div style="display: flex; gap: 6px; justify-content: center; margin-bottom: 3rem; background: rgba(255,255,255,0.02); padding: 1.5rem 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); position: relative;" id="scale-container">
                        ${[1, 2, 3, 4, 5, 6, 7, 8].map(i => `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                                <div style="width: 28px; height: 90px; border: 2px solid rgba(255,255,255,0.2); border-radius: 0 0 12px 12px; position: relative; background: rgba(255,255,255,0.03);">
                                    <div style="position: absolute; bottom: 0; width: 100%; height: ${15 + i * 10}%; background: rgba(59, 130, 246, ${0.1 + (i / 8) * 0.8}); border-radius: 0 0 10px 10px;"></div>
                                </div>
                                <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted);">${i}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div id="drag-zone" style="width: 100%; height: 140px; position: relative; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem;">
                         <p style="font-size: 0.85rem; color: var(--accent-secondary); margin-bottom: 1rem; font-weight: 600;">Glisse le TUBE X sur l'échelle pour comparer :</p>
                         <div id="tube-x" style="width: 32px; height: 100px; border: 3px solid var(--accent-primary); border-radius: 0 0 15px 15px; background: rgba(15, 23, 42, 0.95); position: absolute; left: 20px; top: 40px; cursor: grab; transition: none; z-index: 100; box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);">
                            <div style="position: absolute; bottom: 0; width: 100%; height: 65%; background: rgba(59, 130, 246, 0.5); border-radius: 0 0 12px 12px;"></div>
                            <span style="position: absolute; top: -25px; width: 100%; text-align: center; color: var(--accent-primary); font-weight: 900; font-size: 1rem;">X</span>
                         </div>
                    </div>
                </div>
            `;
            const tx = container.querySelector('#tube-x');
            const dz = container.querySelector('#drag-zone');
            let isDraggingX = false;
            let startDragX = 0;
            let startDragY = 0;
            let currentPosX = 20;
            let currentPosY = 40;

            const onDragStart = (e) => {
                isDraggingX = true;
                const clientX = e.clientX || e.touches[0].clientX;
                const clientY = e.clientY || e.touches[0].clientY;
                startDragX = clientX - currentPosX;
                startDragY = clientY - currentPosY;
                tx.style.cursor = 'grabbing';
                tx.style.boxShadow = '0 0 30px rgba(249, 115, 22, 0.6)';
            };
            
            const onDragMove = (e) => {
                if (!isDraggingX) return;
                const clientX = e.clientX || e.touches[0].clientX;
                const clientY = e.clientY || e.touches[0].clientY;
                currentPosX = clientX - startDragX;
                currentPosY = clientY - startDragY;
                tx.style.left = currentPosX + "px";
                tx.style.top = currentPosY + "px";
            };
            
            const onDragEnd = () => { 
                isDraggingX = false; 
                tx.style.cursor = 'grab';
                tx.style.boxShadow = '0 0 20px rgba(249, 115, 22, 0.3)';
            };

            tx.addEventListener('mousedown', onDragStart);
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('mouseup', onDragEnd);
            tx.addEventListener('touchstart', (e) => { e.preventDefault(); onDragStart(e); });
            window.addEventListener('touchmove', onDragMove);
            window.addEventListener('touchend', onDragEnd);
            break;

        case 'ailante':
            container.innerHTML = `
                <div id="ailante-step-1">
                     <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text-muted);">Prends en photo l'Ailante et entoure les folioles sur ton écran.</p>
                     <video id="v-ailante" style="width: 100%; border-radius: 12px; display: none;" autoplay playsinline></video>
                     <canvas id="c-ailante" style="width: 100%; border-radius: 12px; background: #111; min-height: 200px; display: block; border: 1px solid rgba(255,255,255,0.1);"></canvas>
                     <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button id="cam-ailante" class="secondary" style="font-size: 0.8rem;">📸 CAPTURE</button>
                        <button id="next-ailante" class="secondary" style="font-size: 0.8rem; display: none; background: var(--accent-secondary); color: white;">ÉTAPE SUIVANTE</button>
                     </div>
                </div>
                <div id="ailante-step-2" style="display: none;">
                    <div class="card" style="background: rgba(59, 130, 246, 0.1); border-color: var(--accent-secondary); margin-bottom: 1rem;">
                        <p style="font-size: 0.9rem;"><strong>VRAI OU FAUX ?</strong></p>
                        <p style="font-size: 0.85rem; margin-top: 0.5rem;">Ses feuilles sont constituées de plus de 10 folioles.</p>
                        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                            <button id="vf-vrai" class="secondary" style="font-size: 0.8rem;">VRAI</button>
                            <button id="vf-faux" class="secondary" style="font-size: 0.8rem;">FAUX</button>
                        </div>
                    </div>
                    <div id="ailante-final" style="display: none;">
                         <p style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 700;">Correct ! Reste une dernière question...</p>
                         <p style="font-size: 0.8rem; margin-top: 0.5rem; color: var(--text-muted);">Réponds à la question en bas de la page.</p>
                    </div>
                </div>
            `;
            const vAi = container.querySelector('#v-ailante');
            const cAi = container.querySelector('#c-ailante');
            const ctxAi = cAi.getContext('2d');
            const btnAiCam = container.querySelector('#cam-ailante');
            const btnAiNext = container.querySelector('#next-ailante');
            const stepAi1 = container.querySelector('#ailante-step-1');
            const stepAi2 = container.querySelector('#ailante-step-2');
            let aiStream = null;

            btnAiCam.onclick = async () => {
                if (!aiStream) {
                    try {
                        aiStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                        vAi.style.display = 'block'; cAi.style.display = 'none';
                        vAi.srcObject = aiStream;
                        btnAiCam.innerText = "SAISIR";
                    } catch(e) { alert("Caméra non accessible"); }
                } else {
                    cAi.width = vAi.videoWidth; cAi.height = vAi.videoHeight;
                    ctxAi.drawImage(vAi, 0, 0);
                    vAi.style.display = 'none'; cAi.style.display = 'block';
                    btnAiCam.innerText = "📸 REPRENDRE";
                    btnAiNext.style.display = 'block';
                    if(aiStream) aiStream.getTracks().forEach(t => t.stop());
                    aiStream = null;
                }
            };

            btnAiNext.onclick = () => { stepAi1.style.display = 'none'; stepAi2.style.display = 'block'; };

            container.querySelector('#vf-vrai').onclick = () => {
                AudioEngine.play('success');
                container.querySelector('#ailante-final').style.display = 'block';
            };
            container.querySelector('#vf-faux').onclick = () => {
                AudioEngine.play('error');
                alert("Erreur ! Regarde bien les folioles.");
            };
            break;

        case 'photosynthesis':
            container.innerHTML = `
                <div id="photo-step-1">
                    <p style="font-size: 0.9rem; margin-bottom: 1rem; color: var(--text-muted);">Comment appelle-t-on le pigment vert des végétaux ?</p>
                    <div class="input-group">
                        <input type="text" id="pigment-in" placeholder="Réponse...">
                    </div>
                    <button id="pigment-check" class="secondary">VALIDER ÉTAPE 1</button>
                </div>
                <div id="photo-step-2" style="display: none;">
                    <div class="card" style="background: rgba(16, 185, 129, 0.1); border-color: var(--success); margin-bottom: 1rem;">
                        <p style="font-size: 0.9rem; color: var(--success);">Bravo ! C'est bien la <strong>chlorophylle</strong>.</p>
                    </div>
                    <p style="font-size: 0.9rem; margin-bottom: 1rem; color: var(--text-muted);">Ce pigment est situé dans des organites permettant la photosynthèse. Quel est le nom de cet organite ?</p>
                    <div class="input-group">
                        <input type="text" id="organite-in" placeholder="Nom de l'organite...">
                    </div>
                    <p style="font-size: 0.8rem; margin-top: 1rem; color: var(--accent-primary); font-weight: 700;">Calcule le nombre de lettres de ce mot et saisis-le dans la case "Réponse" en bas !</p>
                </div>
            `;
            const pIn = container.querySelector('#pigment-in');
            const step1 = container.querySelector('#photo-step-1');
            const step2 = container.querySelector('#photo-step-2');
            
            container.querySelector('#pigment-check').onclick = () => {
                if (pIn.value.toLowerCase().includes('chlorophylle')) {
                    step1.style.display = 'none';
                    step2.style.display = 'block';
                    AudioEngine.play('success');
                } else {
                    AudioEngine.play('error');
                    alert("Ce n'est pas le bon pigment !");
                }
            };
            break;

        default:
            container.innerHTML = `<p>Saisie manuelle pour cette étape.</p>`;
    }
}

// --- INIT ---
loadState();
render();
