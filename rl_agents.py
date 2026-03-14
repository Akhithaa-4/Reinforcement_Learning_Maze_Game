import numpy as np, random

ACTIONS = [(-1, 0), (0, 1), (1, 0), (0, -1)]

class BaseAgent:
    def __init__(self, obs_size, action_size, alpha=0.7, gamma=0.95,
                 epsilon=1.0, epsilon_min=0.01, epsilon_decay=0.995):
        self.obs_size = obs_size
        self.action_size = action_size
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.Q = np.zeros((obs_size, action_size))

    def select_action(self, s):
        return random.randrange(self.action_size) if random.random() < self.epsilon else int(np.argmax(self.Q[s]))

    def decay(self):
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)


class QLearningAgent(BaseAgent):
    def update(self, s, a, r, s_next, done):
        best = np.max(self.Q[s_next]) if not done else 0.0
        td = r + self.gamma * best - self.Q[s, a]
        self.Q[s, a] += self.alpha * td


class SARSAAgent(BaseAgent):
    def __init__(self, obs_size, action_size,
                 alpha=0.4, gamma=0.99,
                 epsilon=1.0, epsilon_min=0.01, epsilon_decay=0.995):
        super().__init__(obs_size, action_size, alpha, gamma, epsilon, epsilon_min, epsilon_decay)

    def update(self, s, a, r, s_next, a_next, done):
        q_next = self.Q[s_next, a_next] if not done else 0.0
        td = r + self.gamma * q_next - self.Q[s, a]
        self.Q[s, a] += self.alpha * td


def train_agent(grid, start, exit_cell, agent, episodes=3000, max_steps=4000):
    rows, cols = grid.shape

    def idx(p):
        return p[0] * cols + p[1]

    history = {'rewards': []}
    for ep in range(episodes):
        pos = tuple(start)
        s = idx(pos)
        total = 0
        done = False
        steps = 0

        if isinstance(agent, SARSAAgent):
            a = agent.select_action(s)

        while not done and steps < max_steps:
            if isinstance(agent, SARSAAgent):
                dr, dc = ACTIONS[a]
                nr, nc = pos[0] + dr, pos[1] + dc
                if not (0 <= nr < rows and 0 <= nc < cols) or grid[nr, nc] == 1:
                    r = -5
                    s_next = s
                    a_next = agent.select_action(s_next)
                    agent.update(s, a, r, s_next, a_next, False)
                    total += r
                else:
                    pos = (nr, nc)
                    s_next = idx(pos)
                    if pos == tuple(exit_cell):
                        r = 100
                        agent.update(s, a, r, s_next, None, True)
                        total += r
                        done = True
                        s = s_next
                        break
                    else:
                        r = -1
                        a_next = agent.select_action(s_next)
                        agent.update(s, a, r, s_next, a_next, False)
                        s, a = s_next, a_next
                        total += r
            else:
                a = agent.select_action(s)
                dr, dc = ACTIONS[a]
                nr, nc = pos[0] + dr, pos[1] + dc
                if not (0 <= nr < rows and 0 <= nc < cols) or grid[nr, nc] == 1:
                    r = -5
                    s_next = s
                else:
                    pos = (nr, nc)
                    s_next = idx(pos)
                    if pos == tuple(exit_cell):
                        r = 100
                        done = True
                    else:
                        r = -1
                agent.update(s, a, r, s_next, done)
                s = s_next
                total += r
            steps += 1

        agent.decay()
        history['rewards'].append(total)

        # Log SARSA progress every 100 episodes
        if isinstance(agent, SARSAAgent) and ep % 100 == 0:
            print(f"SARSA Episode {ep}: Total reward = {total}, Epsilon = {agent.epsilon:.4f}")

    return history

