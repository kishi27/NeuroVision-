import sqlite3

conn = sqlite3.connect("backend/vision_trainer.db")
c = conn.cursor()

columns = [col[1] for col in c.execute("PRAGMA table_info(sessions)").fetchall()]
if "session_mode" not in columns:
    c.execute("ALTER TABLE sessions ADD COLUMN session_mode VARCHAR NOT NULL DEFAULT 'standard'")
    conn.commit()
    print("Added column session_mode to sessions table!")
else:
    print("Column session_mode already exists.")

conn.close()
