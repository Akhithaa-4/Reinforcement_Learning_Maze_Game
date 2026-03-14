# QUICK FIX: Replace your app.py with this corrected version

from flask import Flask, request, jsonify, send_from_directory, session, g
from maze import generate_maze, maze_to_grid
from rl_agents import QLearningAgent, SARSAAgent, train_agent
import numpy as np
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import traceback
import uuid
# Imports remain as is...
from flask import Flask, request, jsonify, session, g, send_from_directory
import sqlite3
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'your_secret_key_here_change_this'

DATABASE = 'users.db'

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
    return db

def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()
def init_db():
    with app.app_context():
        db = get_db()
        # No dropping of tables
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                passwordhash TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0
            )
        """)
        # Other tables as before
        db.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                mode TEXT NOT NULL,
                difficulty TEXT NOT NULL DEFAULT 'medium',
                score INTEGER NOT NULL,
                createdat DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS devicetokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                devicetoken TEXT UNIQUE NOT NULL
            )
        """)
        db.commit()


@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')



# Save preference
@app.route('/api/setpreference', methods=['POST'])
def setpreference():
    data = request.get_json()
    username = data.get('username')
    key = data.get('key')
    value = data.get('value')
    db = get_db()
    db.execute('DELETE FROM preferences WHERE username=? AND key=?', (username, key))
    db.execute('INSERT INTO preferences (username, key, value) VALUES (?, ?, ?)', (username, key, value))
    db.commit()
    return jsonify(message="Preference saved")

@app.route('/api/getpreferences', methods=['GET'])
def get_preferences():
    username = request.args.get('username')
    db = get_db()
    prefs = db.execute("SELECT key, value FROM preferences WHERE username=?", [username]).fetchall()
    return jsonify({'preferences': {k: v for k, v in prefs}})


# Device token logic for auto-login


@app.route('/tokenlogin', methods=['POST'])
def tokenlogin():
    data = request.get_json()
    devicetoken = data.get('devicetoken')
    print(f"Received device token: {devicetoken}")
    if not devicetoken:
        return jsonify({'error': 'Missing device token'}), 400
    db = get_db()
    entry = db.execute("SELECT username FROM devicetokens WHERE devicetoken = ?", [devicetoken]).fetchone()
    print(f"DB lookup result: {entry}")
    if entry:
        session['username'] = entry[0]
        return jsonify({'message': 'Auto-login successful', 'username': entry[0]}), 200
    return jsonify({'error': 'Invalid device'}), 401


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    devicetoken = data.get('devicetoken')
    db = get_db()
    user = db.execute("SELECT id, passwordhash, is_admin FROM users WHERE username = ?", [username]).fetchone()
    if user and check_password_hash(user[1], password):
        session['userid'] = user[0]
        session['username'] = username
        session['is_admin'] = user[2]
        if devicetoken:
            db.execute("DELETE FROM devicetokens WHERE devicetoken = ?", [devicetoken])
            db.execute("INSERT INTO devicetokens (username, devicetoken) VALUES (?, ?)", [username, devicetoken])
            db.commit()
        # Fetch saved preferences for user
        prefs = db.execute("SELECT key, value FROM preferences WHERE username = ?", [username]).fetchall()
        preferences = {k: v for k, v in prefs}
        return jsonify({'message': 'Login successful', 'devicetoken': devicetoken, 'is_admin': user[2], 'preferences': preferences})
    return jsonify({'error': 'Invalid credentials'}), 401



@app.route('/register', methods=['GET'])
def registerpage():
    # Serve registration form HTML page
    return send_from_directory('templates', 'register.html')


    # ... your register logic here ...


@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    passwordhash = generate_password_hash(password)
    try:
        db = get_db()
        db.execute("INSERT INTO users (username, passwordhash) VALUES (?, ?)", (username, passwordhash))
        db.commit()
        return jsonify({'message': 'User registered successfully'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 409
    except Exception as e:
        print("Registration error:", e)
        return jsonify({'error': 'Registration failed'}), 500






@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

# FIXED: Submit score endpoint

# FIXED: Get scores endpoint
@app.route('/api/scores', methods=['GET'])
def get_scores():
    mode = request.args.get('mode')
    difficulty = request.args.get('difficulty', 'medium')

    if not mode:
        return jsonify({'error': 'Mode parameter is required'}), 400

    try:
        db = get_db()
        cursor = db.execute(
            'SELECT username, score FROM scores WHERE mode = ? AND difficulty = ? ORDER BY score DESC LIMIT 10',
            (mode, difficulty)
        )
        scores = [{'username': row[0], 'score': row[1]} for row in cursor.fetchall()]
        cursor.close()
        return jsonify(scores)
    except Exception as e:
        print(f"Error fetching scores: {e}")
        return jsonify({'error': 'Database error'}), 500

@app.route('/api/submit_score', methods=['POST'])
def submit_score():
    data = request.get_json()
    username = data.get('username')
    mode = data.get('mode')
    difficulty = data.get('difficulty', 'medium')  # New parameter
    score = data.get('score')

    if not username or not mode or score is None:
        return jsonify({'error': 'Missing required parameters'}), 400

    try:
        score_int = int(score)
    except Exception:
        return jsonify({'error': 'Score must be an integer'}), 400

    try:
        db = get_db()
        db.execute('INSERT INTO scores (username, mode, difficulty, score) VALUES (?, ?, ?, ?)',
                   (username, mode, difficulty, score_int))
        db.commit()
        return jsonify({'message': 'Score saved successfully'})
    except Exception as e:
        print("Error saving score:", e)
        traceback.print_exc()
        return jsonify({'error': 'Failed to save score'}), 500

@app.route('/api/create_maze', methods=['GET'])
def api_create_maze():
    difficulty = request.args.get('difficulty', 'medium')

    if difficulty == 'easy':
        rows, cols = 15, 15  # current hard becomes easy size
    elif difficulty == 'medium':
        rows, cols = 25, 25  # current very hard becomes medium
    else:  # hard
        rows, cols = 35, 35  # new harder size


    # Pass difficulty to generate_maze so extra paths are added
    maze = generate_maze(rows, cols, difficulty)
    
    grid = maze_to_grid(maze)  # Correct function name

    start = (1, 1)
    exit_cell = (rows - 2, cols - 2)
    #print(f"Generating maze with difficulty={difficulty}, extra_paths={extra_paths}")
    # Ensure exit is accessible
    if exit_cell == start or grid[exit_cell[0], exit_cell[1]] == 1:
        for r in range(rows - 2, 0, -1):
            for c in range(cols - 2, 0, -1):
                if grid[r, c] == 0 and (r, c) != start:
                    exit_cell = (r, c)
                    break
            else:
                continue
            break

    return jsonify({
        'grid': grid.tolist(),
        'start': start,
        'exit': exit_cell
    })


@app.route('/api/run_ai', methods=['POST'])
def api_run_ai():
    data = request.get_json()
    algo = data.get('algo', 'q')
    grid = np.array(data['grid'])
    start = tuple(data['start'])
    exit_cell = tuple(data['exit'])
    
    print(f"🤖 Running AI: algorithm={algo}")
    
    rows, cols = grid.shape
    episodes = 3000
    max_steps = 4000
    
    try:
        if algo == 'q':
            agent = QLearningAgent(obs_size=grid.size, action_size=4)
            train_agent(grid, start, exit_cell, agent, episodes=episodes, max_steps=max_steps)
        else:
            agent = SARSAAgent(obs_size=grid.size, action_size=4, epsilon_decay=0.995, alpha=0.4, gamma=0.99)
            train_agent(grid, start, exit_cell, agent, episodes=episodes, max_steps=max_steps)
        
        # Generate path
        path = []
        pos = start
        
        def idx(p):
            return p[0] * cols + p[1]
        
        steps = 0
        visited = set()
        
        while pos != exit_cell and steps < (rows * cols * 10):
            s = idx(pos)
            a = int(np.argmax(agent.Q[s]))
            dr, dc = [(-1, 0), (0, 1), (1, 0), (0, -1)][a]
            nr, nc = pos[0] + dr, pos[1] + dc
            
            if not (0 <= nr < rows and 0 <= nc < cols) or grid[nr, nc] == 1:
                break
                
            pos = (nr, nc)
            path.append([pos[0], pos[1]])
            
            if pos in visited:
                break
            visited.add(pos)
            steps += 1
        
        path = [[start[0], start[1]]] + path
        score = 100 - steps if pos == exit_cell else 0
        
        print(f"✅ AI completed: steps={steps}, reached_goal={pos == exit_cell}")
        
        return jsonify({
            'path': path,
            'score': score,
            'steps': steps
        })
    except Exception as e:
        print(f"❌ AI error: {e}")
        return jsonify({'error': 'AI processing failed'}), 500
@app.route('/api/deletescores', methods=['POST'])
def deletescores():
    data = request.get_json()
    username = data.get('username')
    mode = data.get('mode')
    difficulty = data.get('difficulty')  # ADD THIS
    if not username or not mode or not difficulty:
        return jsonify({'error': 'Missing parameters'}), 400
    try:
        db = get_db()
        db.execute('DELETE FROM scores WHERE username = ? AND mode = ? AND difficulty = ?', (username, mode, difficulty))
        db.commit()
        return jsonify({'message': 'Scores deleted successfully'})
    except Exception as e:
        print("Error deleting scores:", e)
        return jsonify({'error': 'Failed to delete scores'}), 500




@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)

@app.route('/admin/users', methods=['GET'])
def admin_users():
    if session.get('is_admin') != 1:
        return jsonify({'error': 'Admins only'}), 403
    db = get_db()
    users = db.execute("SELECT username, is_admin FROM users").fetchall()
    return jsonify({'users': [{'username': u[0], 'is_admin': u[1]} for u in users]})


if __name__ == '__main__':
    print("🚀 Starting Maze Runner server...")
    init_db()  
    print("🌐 Server running at http://127.0.0.1:8501")
    app.run(host='0.0.0.0', port=8501, debug=True)