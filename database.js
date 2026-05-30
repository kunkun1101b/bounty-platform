const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bounty.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            balance INTEGER DEFAULT 500,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            bounty INTEGER NOT NULL,
            status TEXT DEFAULT 'open',
            creator_id INTEGER NOT NULL,
            hunter_id INTEGER,
            images TEXT,
            submit_images TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id),
            FOREIGN KEY (hunter_id) REFERENCES users(id)
        )
    `);
    
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, balance, is_admin) VALUES ('admin', 9999, 1)");
            console.log('管理员账户已创建: admin');
        }
    });
    
    db.get("SELECT * FROM tasks LIMIT 1", (err, row) => {
        if (!row) {
            db.run(`
                INSERT INTO tasks (title, description, bounty, status, creator_id, images) 
                VALUES ('欢迎使用赏金平台', '这是一个示例任务！任何人都可以发布任务，快来试试吧！', 100, 'open', 1, '[]')
            `);
        }
    });
});

module.exports = {
    getUserById: (id, callback) => {
        db.get("SELECT * FROM users WHERE id = ?", [id], callback);
    },
    getUserByUsername: (username, callback) => {
        db.get("SELECT * FROM users WHERE username = ?", [username], callback);
    },
    createUser: (username, balance, callback) => {
        db.run("INSERT INTO users (username, balance) VALUES (?, ?)", [username, balance], function(err) {
            callback(err, this?.lastID);
        });
    },
    updateUserBalance: (userId, newBalance, callback) => {
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, userId], callback);
    },
    getAllTasks: (callback) => {
        db.all(`
            SELECT t.*, u.username as creator_name, h.username as hunter_name
            FROM tasks t
            LEFT JOIN users u ON t.creator_id = u.id
            LEFT JOIN users h ON t.hunter_id = h.id
            ORDER BY t.created_at DESC
        `, callback);
    },
    getTaskById: (id, callback) => {
        db.get("SELECT * FROM tasks WHERE id = ?", [id], callback);
    },
    createTask: (title, description, bounty, creatorId, images, callback) => {
        db.run(
            "INSERT INTO tasks (title, description, bounty, creator_id, images) VALUES (?, ?, ?, ?, ?)",
            [title, description, bounty, creatorId, JSON.stringify(images)],
            function(err) {
                callback(err, this?.lastID);
            }
        );
    },
    acceptTask: (taskId, hunterId, callback) => {
        db.run("UPDATE tasks SET status = 'in_progress', hunter_id = ? WHERE id = ?", [hunterId, taskId], callback);
    },
    submitTask: (taskId, hunterId, imageUrls, callback) => {
        db.run(
            "UPDATE tasks SET status = 'pending_verify', submit_images = ? WHERE id = ? AND hunter_id = ?",
            [JSON.stringify(imageUrls), taskId, hunterId],
            callback
        );
    },
    completeTask: (taskId, callback) => {
        db.run("UPDATE tasks SET status = 'completed' WHERE id = ?", [taskId], callback);
    },
    deleteTask: (taskId, callback) => {
        db.run("DELETE FROM tasks WHERE id = ?", [taskId], callback);
    },
    getPendingTasks: (callback) => {
        db.all(`
            SELECT t.*, u.username as creator_name, h.username as hunter_name
            FROM tasks t
            LEFT JOIN users u ON t.creator_id = u.id
            LEFT JOIN users h ON t.hunter_id = h.id
            WHERE t.status = 'pending_verify'
            ORDER BY t.created_at DESC
        `, callback);
    }
};