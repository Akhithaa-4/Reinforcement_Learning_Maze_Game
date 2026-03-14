import numpy as np
import random

def generate_maze(rows, cols, difficulty='easy'):
    # Ensure rows and cols are odd for maze symmetry
    if rows % 2 == 0:
        rows += 1
    if cols % 2 == 0:
        cols += 1

    # Initialize maze grid with walls (0)
    maze = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            maze[r][c] = 0

    stack = [(1, 1)]
    maze[1][1] = 1  # Start cell
    dirs = [(-2, 0), (2, 0), (0, -2), (0, 2)]  # Direction vectors for 2-step moves

    # Standard DFS maze generation
    while stack:
        r, c = stack[-1]
        neighbors = []
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 1 <= nr < rows - 1 and 1 <= nc < cols - 1 and maze[nr][nc] == 0:
                neighbors.append((nr, nc, dr, dc))

        if neighbors:
            nr, nc, dr, dc = random.choice(neighbors)
            maze[nr - dr // 2][nc - dc // 2] = 1  # Carve path between cells
            maze[nr][nc] = 1
            stack.append((nr, nc))
        else:
            stack.pop()

    # Add extra paths (loops) based on difficulty
    if difficulty == 'easy':
        extra_paths = int((rows * cols) * 0.07)  # your desired low complexity
    elif difficulty == 'medium':
        extra_paths = int((rows * cols) * 0.12)
    elif difficulty == 'hard':
        extra_paths = int((rows * cols) * 0.15)
    else:
        extra_paths = 0  # fallback or default




    for _ in range(extra_paths):
        r = random.randint(1, rows - 2)
        c = random.randint(1, cols - 2)
        # Break wall only if it is between two paths to create loops
        if maze[r][c] == 0:
            # Check neighbors if adjacent cells are paths (1)
            neighbors_paths = 0
            for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and maze[nr][nc] == 1:
                    neighbors_paths += 1
            # Break wall to create loop only if it connects two or more path cells
            if neighbors_paths >= 2:
                maze[r][c] = 1

    return np.array(maze, dtype=np.uint8)

def maze_to_grid(maze):
    return 1 - maze

