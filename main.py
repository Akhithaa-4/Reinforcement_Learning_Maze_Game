from maze import generate_maze, maze_to_grid
from rl_agents import QLearningAgent, SARSAAgent, train_agent
import numpy as np

def save_agent_qtable(agent, filename):
    np.save(filename, agent.Q)

if __name__ == "__main__":
    rows, cols = 15, 15
    maze = generate_maze(rows, cols)
    grid = maze_to_grid(maze)
    start = (1, 1)
    exit_cell = (rows - 2, cols - 2)

    q_agent = QLearningAgent(obs_size=grid.size, action_size=4)
    print("Training Q-Learning agent...")
    train_agent(grid, start, exit_cell, q_agent, episodes=1000, max_steps=2000)
    save_agent_qtable(q_agent, 'q_agent.npy')
    print("Q-Learning agent saved.")

    sarsa_agent = SARSAAgent(obs_size=grid.size, action_size=4)
    print("Training SARSA agent...")
    train_agent(grid, start, exit_cell, sarsa_agent, episodes=1000, max_steps=2000)
    save_agent_qtable(sarsa_agent, 'sarsa_agent.npy')
    print("SARSA agent saved.")

