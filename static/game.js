// Rewritten game.js - integrated with provided animated index.html (keeps AI training UI)
// This file is intended to replace the original static/game.js in your extracted project.
// It supports:
// - Login / Register (localStorage simulated DB)
// - Mode selection modal (Human / AI)
// - Difficulty selection (uses existing gameSelectionScreen)
// - Full game loop (canvas rendering, HUD, timer, movement)
// - Q-Learning agent with a training modal and controls (episodes, alpha, gamma, epsilon)
// - Saving/Loading Q-table to localStorage for reuse between sessions
//
// NOTE: This is a compact, clear implementation meant to be easy to adapt further.
// If you want me to also update index.html to embed training controls visually in the page,
// I can do that — currently the script injects a small training modal dynamically.
(function () {
    // ---------- Global State ----------
    let currentUser = null;
    let currentMode = 'human'; // 'human' or 'ai'
    let currentDifficulty = 'easy';
    let gameState = {
        
    // existing fields...
        jerryScore: 0,
        jerrySteps: 0,
        jerryFinishTime: null,

        tomScore: 0,
        tomSteps: 0,
        tomFinishTime: null,

        jerryFinished: false,
        tomFinished: false,


        isPlaying: false,
        isPaused: false,
        timeElapsed: 0,
        timeLimit: 120,
        score: 0,
        moves: 0,
        maze: null,
        player: { x: 0, y: 0 },
        goal: { x: 0, y: 0 },
        cellSize: 30,
        timer: null,
        aiInterval: null,
    
    // ... existing properties ...
        ai: null,           // {x:0, y:0} - AI position
        aiPath: null,       // Array of [y,x] steps from backend
        aiReachedGoal: false,
        humanReachedGoal: false


    };

    // Simple 'database' using localStorage
    const database = {
        users: JSON.parse(localStorage.getItem('mh_users') || '[]'),
        scores: JSON.parse(localStorage.getItem('mh_scores') || '[]'),
        saveUsers() { localStorage.setItem('mh_users', JSON.stringify(this.users)); },
        saveScores() { localStorage.setItem('mh_scores', JSON.stringify(this.scores)); }
    };

    // Ensure admin exists
    if (!database.users.find(u => u.username === 'admin')) {
        database.users.push({ id: 'admin', username: 'admin', email: 'admin@maze.local', password: 'admin123', isAdmin: true, createdAt: new Date().toISOString() });
        database.saveUsers();
    }

    // Q-Learning agent
    const QAgent = {
        q: {}, // 'x,y' -> [q0,q1,q2,q3]
        actions: [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}], // up,right,down,left
        getKey(state) { return `${state.x},${state.y}`; },
        ensure(state) {
            const k = this.getKey(state);
            if (!this.q[k]) this.q[k] = [0,0,0,0];
            return this.q[k];
        },
        policy(state, epsilon=0) {
            // epsilon greedy
            this.ensure(state);
            const k = this.getKey(state);
            if (Math.random() < epsilon) return Math.floor(Math.random()*4);
            const vals = this.q[k];
            // choose argmax (tie-breaker random)
            let max = Math.max(...vals);
            const candidates = vals.map((v,i)=>v===max?i:-1).filter(i=>i>=0);
            return candidates[Math.floor(Math.random()*candidates.length)];
        },
        save(name='default') { localStorage.setItem('mh_q_'+name, JSON.stringify(this.q)); },
        load(name='default') { const raw = localStorage.getItem('mh_q_'+name); if (raw) this.q = JSON.parse(raw); },
        reset() { this.q = {}; }
    };

    // ---------- Utility / UI Helpers ----------
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        const el = document.getElementById(screenId);
        if (el) el.classList.add('active');

        updateNavigation();

        // Load leaderboard normally
        if (screenId === 'leaderboardScreen') {
            loadLeaderboard();
        }

        // Admin screen MUST NOT use old loadAdminData()
        // Admin screen should be opened ONLY via openAdminScreen()
    }

    function updateNavigation() {
        const navBtns = document.getElementById('navBtns');
        navBtns.innerHTML = '';
        const frag = document.createDocumentFragment();

        if (currentUser) {

            // ⭐ Show "Admin" only if isAdmin = true
            if (currentUser.isAdmin) {
                const adminBtn = createBtn('⚙️ Admin', () => openAdminScreen());
                
            }

            // Show username
            frag.appendChild(createSpan(`👤 ${currentUser.username}`));

            // Logout button
            
        }

        navBtns.appendChild(frag);
    }



    function createBtn(text, onClick, cls='btn btn-secondary') {
        const b = document.createElement('button');
        b.className = cls;
        b.innerHTML = text;
        b.addEventListener('click', onClick);
        return b;
    }
    function createSpan(text) { const s=document.createElement('span'); s.style.marginRight='1rem'; s.textContent=text; return s; }

    function showToast(message, type='success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(()=>{ toast.style.animation = 'slideInRight 0.3s ease reverse'; setTimeout(()=>toast.remove(),300); }, 3000);
    }

    // ---------- Authentication ----------
    document.getElementById('loginForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        
        const user = database.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            currentUser = user;
            showToast('Login successful!', 'success');

            if (user.isAdmin) {
                // ⭐ ADMIN: Go directly to admin dashboard
                openAdminScreen();
            } else {
                // ⭐ NORMAL USER: Load user menu + preferences
                showScreen('gameMenuScreen');
                document.getElementById('userWelcomeName').textContent = user.username;
                loadPreferences();  
            }

            updateNavigation();
            
        } else {
            showToast('Invalid username or password','error');
        }
    });

    document.getElementById('registerForm').addEventListener('submit', (e)=>{
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        if (database.users.find(u=>u.username===username)) { showToast('Username exists','error'); return; }
        const newUser = { id: Date.now().toString(), username, email, password, isAdmin:false, createdAt:new Date().toISOString() };
        database.users.push(newUser); database.saveUsers();
        showToast('Registered! Please login','success'); showScreen('loginScreen');
    });

    function logout() { currentUser = null; updateNavigation(); showScreen('homeScreen'); showToast('Logged out','success'); }

    // ---------- Mode Selection (injected modal) ----------
    const modeModalHtml = `
        <div id="modeModal" class="modal">
            <div class="modal-content">
            <h2>Choose Mode</h2>
            <p style="font-weight:700">Play yourself or race against the AI.</p>
            <div style="display:flex; gap:1rem; justify-content:center; margin-top:1rem;">
                <button class="btn btn-primary" id="modeHumanBtn">Play (Human)</button>
                <button class="btn btn-secondary" id="modeAiBtn">AI Mode</button>
            </div>
            <div style="margin-top:1rem;">
                <button class="btn btn-secondary" onclick="document.getElementById('modeModal').classList.remove('active')">Cancel</button>
            </div>
            </div>
        </div>
        `;

    document.body.insertAdjacentHTML('beforeend', modeModalHtml);
    document.getElementById('modeHumanBtn').addEventListener('click', ()=>{ currentMode='human'; document.getElementById('modeModal').classList.remove('active'); showScreen('gameSelectionScreen'); });
    document.getElementById('modeAiBtn').addEventListener('click', ()=>{ currentMode='ai'; document.getElementById('modeModal').classList.remove('active'); showScreen('gameSelectionScreen'); });
    

    function openModeSelection() { document.getElementById('modeModal').classList.add('active'); }

    // ---------- Training Modal (injected) ----------
    

    function openTrainingModal() { document.getElementById('trainingModal').classList.add('active'); }

    // ---------- Maze Generation (recursive backtracking) ----------
    function generateMaze(size) {
        const maze = Array.from({length:size}, ()=>Array.from({length:size}, ()=>({top:true,right:true,bottom:true,left:true,visited:false})));
        function carve(x,y){
            maze[y][x].visited = true;
            const dirs = [{dx:0,dy:-1,wall:'top',opp:'bottom'},{dx:1,dy:0,wall:'right',opp:'left'},{dx:0,dy:1,wall:'bottom',opp:'top'},{dx:-1,dy:0,wall:'left',opp:'right'}].sort(()=>Math.random()-0.5);
            for(const d of dirs){
                const nx=x+d.dx, ny=y+d.dy;
                if(nx>=0 && nx<size && ny>=0 && ny<size && !maze[ny][nx].visited){
                    maze[y][x][d.wall]=false;
                    maze[ny][nx][d.opp]=false;
                    carve(nx,ny);
                }
            }
        }
        carve(0,0);
        return maze;
    }

    // ---------- Canvas Drawing (adapted from index.html visual style) ----------
    function initCanvas() {
        const canvas = document.getElementById('gameCanvas');

        if (!gameState.grid) return;  // nothing to draw yet

        const rows = gameState.grid.length;
        const cols = gameState.grid[0].length;

        const size = Math.max(rows, cols);
        gameState.cellSize = Math.min(560 / size, 30);

        canvas.width  = cols * gameState.cellSize;
        canvas.height = rows * gameState.cellSize;
    }



    function drawMaze() {
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        if (!gameState.grid) return;  // backend maze not ready yet

        const rows = gameState.grid.length;
        const cols = gameState.grid[0].length;

        const cellSize = gameState.cellSize;
        canvas.width  = cols * cellSize;
        canvas.height = rows * cellSize;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // background
        const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // path style (0 = path, 1 = wall)
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#8B4513');
        grad.addColorStop(0.33, '#FFD700');
        grad.addColorStop(0.66, '#4A90E2');
        grad.addColorStop(1, '#8B4513');
        ctx.fillStyle = grad;

        // draw PATH cells from backend grid
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (gameState.grid[r][c] === 0) { // path
                    ctx.fillRect(
                        c * cellSize,
                        r * cellSize,
                        cellSize,
                        cellSize
                    );
                }
            }
        }

        // goal
        if (gameState.goal) {
            const gp = Math.sin(Date.now() / 500) * 5 + 18;
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = gp;
            ctx.beginPath();
            ctx.arc(
                gameState.goal.x * cellSize + cellSize / 2,
                gameState.goal.y * cellSize + cellSize / 2,
                cellSize / 3,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Jerry
        if (gameState.player) {
            const pp = Math.sin(Date.now() / 400) * 4 + 12;
            ctx.fillStyle = '#8B4513';
            ctx.shadowColor = '#8B4513';
            ctx.shadowBlur = pp;
            ctx.beginPath();
            ctx.arc(
                gameState.player.x * cellSize + cellSize / 2,
                gameState.player.y * cellSize + cellSize / 2,
                cellSize / 3,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Tom
        if (gameState.ai) {
            const ap = Math.sin(Date.now() / 300) * 3 + 10;
            ctx.fillStyle = '#E24A4A';
            ctx.shadowColor = '#E24A4A';
            ctx.shadowBlur = ap;
            ctx.beginPath();
            ctx.arc(
                gameState.ai.x * cellSize + cellSize / 2,
                gameState.ai.y * cellSize + cellSize / 2,
                cellSize / 3,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#333';
            ctx.font = `${Math.max(cellSize * 0.6, 12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(
                '🤖',
                gameState.ai.x * cellSize + cellSize / 2,
                gameState.ai.y * cellSize + cellSize * 0.7
            );
        }
    }




    // ---------- Movement and Game Loop ----------
    function movePlayer(dx, dy) {
        if (!gameState.isPlaying || gameState.isPaused) return false;

        const newX = gameState.player.x + dx;
        const newY = gameState.player.y + dy;

        if (newX < 0 || newX >= gameState.cols || newY < 0 || newY >= gameState.rows) return false;

        if (gameState.grid[newY][newX] === 1) { // wall
            gameState.jerryScore -= 5;
            updateHUD();
            return false;
        }

        gameState.player.x = newX;
        gameState.player.y = newY;

        gameState.moves++;
        gameState.jerrySteps++;
        gameState.jerryScore -= 1;

        updateHUD();
        drawMaze();

        if (newX === gameState.goal.x && newY === gameState.goal.y) {
            gameState.jerryScore += 100;
            gameState.jerryFinished = true;
            gameState.jerryFinishTime = gameState.timeElapsed;

            if (currentMode === 'ai') {
                // race mode: compare Jerry vs Tom
                checkRaceResult();
            } else {
                // pure human mode: normal “you won” flow
                gameState.isPlaying = false;
                clearInterval(gameState.timer);
                winGame();   // or your existing finishGame/you‑win function
            }
        }

        return true;
    }



    function startTimer() {
        clearInterval(gameState.timer);
        gameState.timer = setInterval(() => {
            if (!gameState.isPaused && gameState.isPlaying) {
                gameState.timeElapsed++;
                updateHUD();

                if (gameState.timeElapsed >= gameState.timeLimit) {
                    failGame();
                }
            }
        }, 1000);
    }
    
    function updateHUD() {
        document.getElementById('timeValue').textContent =
            Math.floor(gameState.timeElapsed / 60) + ':' +
            String(gameState.timeElapsed % 60).padStart(2, '0');

        // existing global score/moves if you still need them:
        document.getElementById('scoreValue').textContent = gameState.jerryScore;
        document.getElementById('movesValue').textContent = gameState.jerrySteps;

        // EXTRA HUD for Tom & Jerry in AI mode
        const jScore = document.getElementById('jerryScore');
        const jTime  = document.getElementById('jerryTime');
        const jSteps = document.getElementById('jerrySteps');
        const tScore = document.getElementById('tomScore');
        const tTime  = document.getElementById('tomTime');
        const tSteps = document.getElementById('tomSteps');

        if (currentMode === 'ai') {
            if (jScore) jScore.textContent = gameState.jerryScore;
            if (jTime)  jTime.textContent  = formatTime(gameState.jerryFinishTime ?? gameState.timeElapsed);
            if (jSteps) jSteps.textContent = gameState.jerrySteps;

            if (tScore) tScore.textContent = gameState.tomScore;
            if (tTime)  tTime.textContent  = formatTime(gameState.tomFinishTime ?? gameState.timeElapsed);
            if (tSteps) tSteps.textContent = gameState.tomSteps;
        }
    }


    function pauseGame() {
        gameState.isPaused = !gameState.isPaused;
        showToast(gameState.isPaused ? 'Game Paused' : 'Game Resumed','warning');
    }

    function resetGame() { startGame(currentDifficulty, currentMode); }

    function startGame(difficulty, mode) {
        currentDifficulty = difficulty || currentDifficulty;
        currentMode = mode || currentMode || 'human';

        const configs = {
            easy:{size:10,timeLimit:120,base:100},
            medium:{size:15,timeLimit:90,base:200},
            hard:{size:20,timeLimit:60,base:500}
        };
        const cfg = configs[currentDifficulty];

        // Common game state
        gameState.timeElapsed = 0;
        gameState.timeLimit   = cfg.timeLimit;
        gameState.baseScore   = cfg.base;
        gameState.score = 0;
        gameState.moves = 0;
        gameState.isPlaying = true;
        gameState.isPaused  = false;

        if (gameState.aiInterval) {
            clearInterval(gameState.aiInterval);
            gameState.aiInterval = null;
        }

        showScreen('gameScreen');
        updateHUD();
        startTimer();

        // Always use backend maze (same grid for human + AI)
        runSimultaneousAI();
    }

    async function requestBackendPath() {
        try {
            // Convert your local maze (cells with top/right/bottom/left) into 0/1 grid
            const rows = gameState.maze.length;
            const cols = gameState.maze[0].length;
            const grid = Array.from({length: rows}, () => Array(cols).fill(1));

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    // Walkable cell center assumed open in your generator
                    grid[y][x] = 0;
                }
            }

            const start = [0, 0];                       // [row, col]
            const exit  = [rows-1, cols-1];             // match goal

            const res = await fetch('http://127.0.0.1:8501/api/run_ai', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    grid: grid,
                    start: start,
                    exit: exit,
                    algo: 'q'
                })
            });

            if (!res.ok) throw new Error('Backend path error ' + res.status);
            const data = await res.json();
            if (!data.path || !data.path.length) {
                showToast('AI could not find a path', 'error');
                return;
            }

            gameState.aiPath = data.path;
            gameState.aiInterval = setInterval(() => {
                if (!gameState.isPlaying || gameState.isPaused) return;
                advanceAI();
                drawMaze();
            }, 225);
         // move AI along this path
        } catch (err) {
            console.error('requestBackendPath error:', err);
            showToast('AI server not reachable', 'error');
        }
    }

    

    // Simultaneous Human + AI gameplay
    // ✅ USE YOUR REAL BACKEND (port 8501)
    async function runSimultaneousAI() {
        try {
            // 1. Fetch REAL maze from backend
            const mazeRes = await fetch(`http://127.0.0.1:8501/api/create_maze?difficulty=${currentDifficulty}`);
            if (!mazeRes.ok) throw new Error('Maze fetch failed');
            const mazeData = await mazeRes.json();

            // 0 = path, 1 = wall
            gameState.grid = mazeData.grid;
            gameState.rows = mazeData.grid.length;
            gameState.cols = mazeData.grid[0].length;

            const start = { x: mazeData.start[1], y: mazeData.start[0] };
            const exit  = { x: mazeData.exit[1],  y: mazeData.exit[0] };

            // Common state for both modes
            gameState.player = { ...start };   // Jerry
            gameState.goal   = { ...exit };

            gameState.aiPath = null;
            gameState.aiReachedGoal    = false;
            gameState.humanReachedGoal = false;
            gameState.score = 0;
            gameState.moves = 0;
            gameState.timeElapsed = 0;

            showScreen('gameScreen');
            initCanvas();
            drawMaze();
            updateHUD();
            startTimer();

            // If not AI mode, stop here: human-only run on backend maze
            if (currentMode !== 'ai') {
                gameState.ai = null;
                return;
            }

            // 2. AI mode: set up Tom + path
            gameState.ai = { ...start };

            const pathRes = await fetch('http://127.0.0.1:8501/api/run_ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grid: mazeData.grid,
                    start: mazeData.start,   // [y,x]
                    exit:  mazeData.exit,    // [y,x]
                    algo: 'q'
                })
            });

            if (!pathRes.ok) throw new Error('AI path fetch failed');
            const pathData = await pathRes.json();

            if (!pathData.path || !pathData.path.length) {
                showToast('AI found no path! 🌀', 'error');
                return;
            }

            gameState.aiPath = pathData.path;
            console.log('✅ Backend AI Path:', pathData.path.length, 'steps');

            // 3. AI moves automatically, human uses keys simultaneously
            gameState.aiInterval = setInterval(() => {
                if (!gameState.isPlaying || gameState.isPaused) return;
                advanceAI();
                drawMaze();
                // winner decided via checkRaceResult() inside advanceAI/movePlayer
            }, 225);

        } catch (error) {
            console.error('Backend Error:', error);
            showToast('Backend connection failed - check server on port 8501', 'error');
        }
    }


    function advanceAI() {
        if (!gameState.aiPath || gameState.aiPath.length === 0) return;

        const nextStep = gameState.aiPath.shift();  // [row,col]
        gameState.ai.x = nextStep[1];
        gameState.ai.y = nextStep[0];

        gameState.tomSteps++;        // Tom steps
        gameState.tomScore -= 1;     // Tom step penalty

        // Reached goal?
        if (gameState.ai.x === gameState.goal.x && gameState.ai.y === gameState.goal.y) {
            gameState.tomScore += 100;
            gameState.tomFinished = true;
            gameState.tomFinishTime = gameState.timeElapsed;
            clearInterval(gameState.aiInterval);
            gameState.aiInterval = null;
            checkRaceResult();       // NEW
        }

        updateHUD();
    }
    function checkRaceResult() {
        if (currentMode === 'ai') {
            // Race mode: wait for both to finish
            if (!gameState.jerryFinished || !gameState.tomFinished) return;
        } else {
            // Human-only mode: just wait for Jerry
            if (!gameState.jerryFinished) return;
        }

        gameState.isPlaying = false;
        clearInterval(gameState.timer);
        if (gameState.aiInterval) {
            clearInterval(gameState.aiInterval);
            gameState.aiInterval = null;
        }

        let winner = null;

        if (currentMode === 'ai') {
            // Decide winner: score first, then time
            if (gameState.jerryScore > gameState.tomScore) {
                winner = 'Jerry';
            } else if (gameState.tomScore > gameState.jerryScore) {
                winner = 'Tom';
            } else if (gameState.jerryFinishTime < gameState.tomFinishTime) {
                winner = 'Jerry';
            } else if (gameState.tomFinishTime < gameState.jerryFinishTime) {
                winner = 'Tom';
            } else {
                winner = 'Tie';
            }
        } else {
            // Human-only: if Jerry reached goal, player wins
            winner = 'Jerry';
        }

        showRaceResultModal(winner);
    }


    function showRaceResultModal(winner) {
        const titleEl   = document.getElementById('resultTitle');      // big heading
        const msgEl     = document.getElementById('resultMessage');    // sub text
        const scoreEl   = document.getElementById('finalScore');
        const timeEl    = document.getElementById('finalTime');
        const movesEl   = document.getElementById('finalMoves');
        const resultEl  = document.getElementById('finalDifficulty');  // small box

        if (winner === 'Jerry') {
            titleEl.textContent  = 'You Won!';
            msgEl.textContent    = 'Jerry escaped Tom. Great job!';
            resultEl.textContent = 'You beat Tom';
        } else if (winner === 'Tom') {
            titleEl.textContent  = 'You Failed';
            msgEl.textContent    = 'Tom outsmarted you this time.';
            resultEl.textContent = 'Tom wins this race';
        } else {
            titleEl.textContent  = 'It\'s a Tie';
            msgEl.textContent    = 'Both reached the cheese together.';
            resultEl.textContent = 'Tie game';
        }

        scoreEl.textContent =
            `Jerry: ${gameState.jerryScore} | Tom: ${gameState.tomScore}`;
        timeEl.textContent =
            `Jerry: ${formatTime(gameState.jerryFinishTime)} | Tom: ${formatTime(gameState.tomFinishTime)}`;
        movesEl.textContent =
            `Jerry steps: ${gameState.jerrySteps} | Tom steps: ${gameState.tomSteps}`;

        document.getElementById('victoryModal').classList.add('active');
    }


    function formatTime(t) {
        if (t == null) return '-';
        return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }

    function checkWinConditions() {
    // disabled: Tom vs Jerry race uses checkRaceResult()
    return;
}


    function calculateScore() {

    // ⭐ Your new scoring logic:
    // 1. Fast = higher score
    // 2. Fewer moves = award
    // 3. Difficulty multiplier

        let timeFactor = Math.max(1, gameState.timeLimit - gameState.timeElapsed);
        let moveFactor = Math.max(1, 200 - gameState.moves);   // 200 is arbitrary cap

        const difficultyMultiplier = {
            easy: 1,
            medium: 2,
            hard: 3
        }[currentDifficulty];

        let score = (timeFactor * 5) + (moveFactor * 2);
        score = Math.max(0, score); // no negative
        score = Math.round(score * difficultyMultiplier);

        return score;
    }


    // ---------- GAME COMPLETION ----------
    function finishGame() {
    // disabled in AI race mode – use checkRaceResult/showRaceResultModal instead
}



    // ---------- GAME FAILURE ----------
    function failGame() {
        gameState.isPlaying = false;
        clearInterval(gameState.timer);

        showToast("Time's up! You lost!", "error");

        setTimeout(() => {
            showScreen("gameSelectionScreen");
        }, 1500);
    }

    function winGame() {
        gameState.isPlaying = false; clearInterval(gameState.timer); if (gameState.aiInterval) clearInterval(gameState.aiInterval);
        const timeBonus = Math.max(0, gameState.timeLimit - gameState.timeElapsed) * 10;
        const movePenalty = gameState.moves * 2;
        gameState.score = gameState.baseScore + timeBonus - movePenalty;
        // Save score if logged in
        if (currentUser) {
            database.scores.push({ userId: currentUser.id, username: currentUser.username, difficulty: currentDifficulty, time: gameState.timeElapsed, moves: gameState.moves, score: gameState.score, date: new Date().toISOString() });
            database.saveScores();
        }
        // Show modal stats
        document.getElementById('finalTime').textContent = document.getElementById('timeValue').textContent;
        document.getElementById('finalScore').textContent = gameState.score;
        document.getElementById('finalMoves').textContent = gameState.moves;
        document.getElementById('finalDifficulty').textContent = currentDifficulty.toUpperCase();
        document.getElementById('victoryModal').classList.add('active');
    }

    function loseGame() {
        gameState.isPlaying = false; clearInterval(gameState.timer); if (gameState.aiInterval) clearInterval(gameState.aiInterval);
        showToast('Time\'s up! Try again.','error');
        setTimeout(()=> showScreen('gameSelectionScreen'), 1200);
    }

    function closeVictoryModal() { document.getElementById('victoryModal').classList.remove('active'); }

    // ---------- Keyboard Controls (human) ----------
    document.addEventListener('keydown', (e) => {
        if (!gameState.isPlaying || gameState.isPaused) return;

        // REMOVE this line:
        // if (currentMode !== 'human') return;

        const key = e.key;
        if (['ArrowUp','w','W'].includes(key))  movePlayer(0, -1);
        if (['ArrowDown','s','S'].includes(key)) movePlayer(0, 1);
        if (['ArrowLeft','a','A'].includes(key))  movePlayer(-1, 0);
        if (['ArrowRight','d','D'].includes(key)) movePlayer(1, 0);
    });

    // Fetch maze and AI path from backend API, then move AI automatically step-by-step
    async function runAI() {
        try {
            const difficulty = currentDifficulty;
            // Fetch maze from backend
            const resMaze = await fetch(`/api/createmaze?difficulty=${difficulty}`);
            if (!resMaze.ok) throw new Error('Failed to fetch maze');
            const mazeData = await resMaze.json();
            gameState.maze = mazeData.grid;
            gameState.player = { x: mazeData.start[1], y: mazeData.start[0] };  // human player starts here
            gameState.goal = { x: mazeData.exit[1], y: mazeData.exit[0] };
            gameState.ai = { x: mazeData.start[1], y: mazeData.start[0] };
            gameState.timeElapsed = 0;
            gameState.moves = 0;
            gameState.isPlaying = true;
            gameState.isPaused = false;
            gameState.score = 0;

            initCanvas();
            drawMaze();
            updateHUD();
            startTimer();

            // Fetch AI path from backend (algo "q" or "sarsa")
            const resPath = await fetch('/api/runai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grid: gameState.maze,
                    start: [gameState.player.y, gameState.player.x],
                    exit: [gameState.goal.y, gameState.goal.x],
                    algo: 'q' // or 'sarsa' - set as you prefer
                })
            });
            if (!resPath.ok) throw new Error('Failed to fetch AI path');
            const pathData = await resPath.json();

            if (!pathData.path || pathData.path.length === 0) {
                alert('AI could not find a path in this maze.');
                finishGame();
                return;
            }
            gameState.aiPath = pathData.path;

            // Start moving AI along the path step by step every 225ms
            if (gameState.aiInterval) clearInterval(gameState.aiInterval);
            gameState.aiInterval = setInterval(() => {
                if (!gameState.isPlaying || gameState.isPaused) return;

                if (!gameState.aiPath || gameState.aiPath.length === 0) {
                    clearInterval(gameState.aiInterval);
                    gameState.aiInterval = null;
                    finishGame();
                    return;
                }

                // Next step from AI path is [y,x]
                const nextStep = gameState.aiPath.shift();
                gameState.ai.x = nextStep[1];
                gameState.ai.y = nextStep[0];

                // Step penalty
                gameState.score -= 1;
                gameState.moves++;

                drawMaze();
                updateHUD();

                // Check if AI reached goal
                if (gameState.ai.x === gameState.goal.x && gameState.ai.y === gameState.goal.y) {
                    clearInterval(gameState.aiInterval);
                    gameState.aiInterval = null;
                    finishGame();
                }
            }, 225);

        } catch (error) {
            console.error('AI run error:', error);
            alert('AI processing failed! See console for details.');
            finishGame();
        }
    }

    // ---------- Leaderboard / Admin ----------
    function loadLeaderboard() {
        const tbody = document.getElementById('leaderboardBody');
        const sorted = [...database.scores].sort((a,b)=>b.score-a.score).slice(0,10);
        tbody.innerHTML = sorted.map((s,i)=>{
            const rank = i<3 ? `<span class="rank-badge rank-${i+1}">${i+1}</span>`: (i+1);
            const date = new Date(s.date).toLocaleDateString();
            const time = `${Math.floor(s.time/60)}:${String(s.time%60).padStart(2,'0')}`;
            return `<tr><td>${rank}</td><td>${s.username}</td><td><span style="color:${s.difficulty==='easy'?'#10b981':s.difficulty==='medium'?'#f59e0b':'#ef4444'}">${s.difficulty.toUpperCase()}</span></td><td>${time}</td><td style="color:var(--primary);font-weight:700">${s.score}</td><td>${date}</td></tr>`;
        }).join('');
    }

    function loadAdminData() {
        document.getElementById('totalPlayers').textContent = database.users.filter(u=>!u.isAdmin).length;
        document.getElementById('totalGames').textContent = database.scores.length;
        document.getElementById('avgScore').textContent = database.scores.length ? Math.round(database.scores.reduce((a,b)=>a+b.score,0)/database.scores.length) : 0;
        const tbody = document.getElementById('adminPlayersBody');
        tbody.innerHTML = database.users.filter(u=>!u.isAdmin).map(u=>{ const sc = database.scores.filter(s=>s.userId===u.id); return `<tr><td>${u.username}</td><td>${u.email}</td><td>${sc.length}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td></tr>` }).join('');
    }
    function savePreferences() {
        if (!currentUser) return;
        const prefs = {
            difficulty: document.getElementById('prefDifficulty').value,
            sound:      document.getElementById('prefSound').value,
            mode:       document.getElementById('prefMode').value   // NEW
        };
        currentUser.preferences = prefs;
        database.saveUsers();
        showToast('Preferences saved!', 'success');
        }

    function loadPreferences() {
        if (!currentUser || !currentUser.preferences) return;

        const prefs = currentUser.preferences;
        if (prefs.difficulty) {
            document.getElementById('prefDifficulty').value = prefs.difficulty;
            currentDifficulty = prefs.difficulty;            // use for default
        }
        if (prefs.sound) {
            document.getElementById('prefSound').value = prefs.sound;
        }
        if (prefs.mode) {
            document.getElementById('prefMode').value = prefs.mode;
            currentMode = prefs.mode;                        // use for default
        }
        }

    function startFromPreferences() {
        const diff = document.getElementById('prefDifficulty').value;
        const mode = document.getElementById('prefMode').value;

        currentDifficulty = diff;
        currentMode = mode;

        // Optional: save again so guest changes persist for this user
        savePreferences();

        startGame(diff, mode);              // uses your existing startGame
        }
        window.startFromPreferences = startFromPreferences;


    // ---------- Training Implementation (Q-Learning) ----------
    async function startTraining() {
        const episodes = parseInt(document.getElementById('trainEpisodes').value,10) || 1000;
        const alpha = parseFloat(document.getElementById('trainAlpha').value) || 0.1;
        const gamma = parseFloat(document.getElementById('trainGamma').value) || 0.9;
        const epsStart = parseFloat(document.getElementById('trainEpsilon').value) || 0.5;
        const decay = parseFloat(document.getElementById('trainDecay').value) || 0.995;
        const log = document.getElementById('trainingLog');
        log.innerHTML = 'Training started...<br/>';
        // For training, we use a fixed maze size depending on difficulty (medium recommended)
        const size = 12;
        const trainMaze = generateMaze(size);
        const getValidActions = (x,y) => {
            const cell = trainMaze[y][x]; const acts = []; if (!cell.top) acts.push(0); if (!cell.right) acts.push(1); if (!cell.bottom) acts.push(2); if (!cell.left) acts.push(3); return acts;
        };
        QAgent.q = {}; // reset Q
        for(let ep=1; ep<=episodes; ep++){
            let eps = Math.max(0.01, epsStart * Math.pow(decay, ep));
            // start state
            let state = {x:0,y:0};
            const goal = {x:size-1,y:size-1};
            let steps = 0, totalReward = 0;
            while(true){
                QAgent.ensure(state);
                const stateKey = QAgent.getKey(state);
                // choose action
                const valid = getValidActions(state.x,state.y);
                let actionIndex;
                if (Math.random() < eps) { actionIndex = valid[Math.floor(Math.random()*valid.length)]; }
                else {
                    const qvals = QAgent.q[stateKey];
                    // pick best among valid moves
                    let best = -Infinity, bestAct = valid[0];
                    for(const a of valid){ if (qvals[a] > best) { best = qvals[a]; bestAct = a; } }
                    actionIndex = bestAct;
                }
                // take action
                const act = QAgent.actions[actionIndex];
                const newState = {x:state.x+act.dx, y:state.y+act.dy};
                // reward
                let reward = -1;
                if (newState.x===goal.x && newState.y===goal.y) reward = 100;
                // ensure Q for new state
                QAgent.ensure(newState);
                // Q update
                const oldQ = QAgent.q[stateKey][actionIndex];
                const maxNext = Math.max(...QAgent.q[QAgent.getKey(newState)]);
                QAgent.q[stateKey][actionIndex] = oldQ + alpha * (reward + gamma * maxNext - oldQ);
                state = newState;
                steps++; totalReward += reward;
                if (reward===100 || steps > size*size*4) break;
            }
            if (ep % Math.max(1, Math.floor(episodes/10)) === 0) {
                log.innerHTML += `Episode ${ep}/${episodes} — steps ${steps} — eps ${eps.toFixed(3)}<br/>`;
                log.scrollTop = log.scrollHeight;
                await new Promise(r=>setTimeout(r, 10)); // let UI breathe
            }
        }
        log.innerHTML += '<b>Training finished.</b>';
        QAgent.save();
        showToast('Training complete — Q-table saved','success');
    }

    // ---------- Wire up existing index.html buttons (difficulty selection) ----------
    // Replace inline onclicks by hooking DOM after load
    // ---------- ADMIN PANEL LOGIC ----------

/** switch admin panel tabs (sidebar buttons) */
    document.addEventListener('click', function(e){
    if (e.target && e.target.classList && e.target.classList.contains('admin-nav-btn')) {
        const target = e.target.getAttribute('data-target');
        document.querySelectorAll('.admin-panel').forEach(p=>p.style.display='none');
        const el = document.getElementById(target);
        if (el) el.style.display = 'block';
        // active visual
        document.querySelectorAll('.admin-nav-btn').forEach(b=>b.classList.remove('active'));
        e.target.classList.add('active');
    }
    });

    /** Open admin screen and refresh */
    function openAdminScreen() {
    if (!currentUser || !currentUser.isAdmin) {
        showToast('Access denied: Admins only', 'error'); return;
    }
    showScreen('adminScreen');
    document.getElementById('adminWelcome').textContent = currentUser.username;
    renderAdminOverview();
    renderUsersTable();
    renderScoresTable();
    document.querySelectorAll('.admin-nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.admin-nav-btn[data-target="adminOverview"]').classList.add('active');
    }

    /** Overview metrics */
    function renderAdminOverview() {
    document.getElementById('admin_totalPlayers').textContent = database.users.filter(u=>!u.isAdmin).length;
    document.getElementById('admin_totalGames').textContent = database.scores.length;
    const avg = database.scores.length ? Math.round(database.scores.reduce((a,b)=>a+b.score,0)/database.scores.length) : 0;
    document.getElementById('admin_avgScore').textContent = avg;
    }

    /** Users table */
    function renderUsersTable() {
    const tbody = document.getElementById('adminUsersBody');
    tbody.innerHTML = database.users
        .filter(u=>!u.isAdmin)
        .map((u,i)=> {
        const games = database.scores.filter(s=>s.userId===u.id).length;
        return `<tr>
            <td>${i+1}</td>
            <td>${u.username}</td>
            <td>${u.email||'-'}</td>
            <td>${games}</td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
            <button class="btn btn-sm" onclick="viewPreferences('${u.id}')">Prefs</button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')">Delete</button>
            </td>
        </tr>`;
        }).join('');
    }

    /** Scores table */
    function renderScoresTable() {
    const tbody = document.getElementById('adminScoresBody');
    const rows = [...database.scores].reverse().map((s,i)=>{
        const user = database.users.find(u=>u.id===s.userId) || {username:'Guest'};
        const date = new Date(s.date).toLocaleString();
        const time = `${Math.floor(s.time/60)}:${String(s.time%60).padStart(2,'0')}`;
        return `<tr>
        <td>${i+1}</td><td>${user.username}</td><td>${s.difficulty}</td><td>${s.score}</td><td>${time}</td><td>${s.moves}</td><td>${date}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteScore(${i})">Delete</button></td>
        </tr>`;
    }).join('');
    tbody.innerHTML = rows;
    }

    /** View preferences for a user */
    function viewPreferences(userId) {
    const user = database.users.find(u=>u.id === userId);
    const body = document.getElementById('adminPrefsBody');
    if (!user) { body.innerHTML = '<div>User not found</div>'; return; }
    const prefs = user.preferences || {};
    body.innerHTML = `<pre style="white-space:pre-wrap;background:#fff;padding:1rem;border-radius:8px;">${JSON.stringify(prefs, null, 2)}</pre>`;
    // switch to prefs tab
    document.querySelectorAll('.admin-panel').forEach(p=>p.style.display='none');
    document.getElementById('adminPrefs').style.display = 'block';
    }

    /** Delete user (and their scores) */
    function deleteUser(userId) {
    if (!confirm('Delete this user and all their scores?')) return;
    database.users = database.users.filter(u=>u.id !== userId);
    database.scores = database.scores.filter(s=>s.userId !== userId);
    database.saveUsers(); database.saveScores();
    showToast('User deleted', 'success');
    renderUsersTable(); renderScoresTable(); renderAdminOverview();
    }

    /** Delete a single score by index (renderScoresTable indices reversed) */
    function deleteScore(indexReversed) {
    // note: renderScoresTable used reversed order; convert back to index in original array
    const originalIndex = database.scores.length - 1 - indexReversed;
    if (!confirm('Delete this score?')) return;
    database.scores.splice(originalIndex, 1);
    database.saveScores();
    showToast('Score deleted', 'success');
    renderScoresTable(); renderAdminOverview();
    }

    /** Settings helpers */
    function exportDatabase() {
    const blob = new Blob([JSON.stringify({users:database.users, scores:database.scores},null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'maze_db_export.json'; a.click(); URL.revokeObjectURL(url);
    showToast('Export started', 'success');
    }
    function resetAllScores() {
    if (!confirm('Delete all scores?')) return;
    database.scores = []; database.saveScores(); renderScoresTable(); renderAdminOverview(); showToast('All scores cleared', 'success');
    }
    function resetQ() {
    if (!confirm('Reset Q-table?')) return;
    QAgent.reset(); QAgent.save(); showToast('Q-table reset', 'success');
    }
    function seedTestUsers() {
    for (let i=1;i<=3;i++){
        const id = Date.now().toString()+i;
        database.users.push({id, username:'test'+i, email:`test${i}@example.com`, password:'test', isAdmin:false, createdAt:new Date().toISOString()});
    }
    database.saveUsers();
    renderUsersTable();
    showToast('Seeded test users', 'success');
    }

    // ---------- PLAY AS GUEST ----------
    function playAsGuest() {
        currentUser = null;
        showToast("Playing as Guest!", "success");
        openModeSelection(); // open Human / AI modal
    }

    // Make global
    window.playAsGuest = playAsGuest;

    window.startGame = function(difficulty){ startGame(difficulty, currentMode); };
    window.pauseGame = pauseGame;
    window.resetGame = resetGame;
    window.closeVictoryModal = closeVictoryModal;

    // Ensure nav and initial state ready
    updateNavigation();

    // Provide ability for guest quick-play
    document.querySelectorAll('.btn-primary').forEach(btn => btn.addEventListener('click', ()=>{}));
    // If some code expects these functions, expose them
    window.openTrainingModal = openTrainingModal;
    window.openModeSelection = openModeSelection;
    window.showScreen = showScreen;
    window.openAdminScreen = openAdminScreen;
    window.savePreferences = savePreferences;
    window.loadPreferences = loadPreferences;
    window.viewPreferences = viewPreferences;
    window.deleteUser = deleteUser;
    window.deleteScore = deleteScore;
    
    window.renderUsersTable = renderUsersTable;
    window.renderScoresTable = renderScoresTable;
    window.renderAdminOverview = renderAdminOverview;
    


    // Try to load previously saved Q
    QAgent.load();

    // End of script
})();