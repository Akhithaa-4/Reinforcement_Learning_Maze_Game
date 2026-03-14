import sqlite3

conn = sqlite3.connect('users.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
print("Tables:", cursor.fetchall())

cursor.execute("SELECT * FROM users;")  # or any table you want to check
for row in cursor.fetchall():
    print(row)

conn.close()