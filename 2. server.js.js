const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const db = require('./database');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 确保 uploads 目录存在
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 8) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('只允许图片格式'));
    }
});

app.use('/uploads', express.static('uploads'));

// ============ 用户 API ============
app.post('/api/user/login', async (req, res) => {
    const { username } = req.body;
    if (!username || username.trim() === '') {
        return res.status(400).json({ error: '用户名不能为空' });
    }
    
    db.getUserByUsername(username, async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (!user) {
            db.createUser(username, 500, (err, userId) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ 
                    success: true, 
                    user: { id: userId, username, balance: 500, isAdmin: username === 'admin' }
                });
            });
        } else {
            res.json({ 
                success: true, 
                user: { id: user.id, username: user.username, balance: user.balance, isAdmin: user.is_admin === 1 }
            });
        }
    });
});

app.get('/api/user/:id', (req, res) => {
    db.getUserById(req.params.id, (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: '用户不存在' });
        res.json({ id: user.id, username: user.username, balance: user.balance, isAdmin: user.is_admin === 1 });
    });
});

// ============ 任务 API ============
app.get('/api/tasks', (req, res) => {
    db.getAllTasks((err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(tasks);
    });
});

app.post('/api/tasks', async (req, res) => {
    const { title, description, bounty, creatorId, images } = req.body;
    
    if (!title || !description || !bounty || !creatorId) {
        return res.status(400).json({ error: '缺少必要参数' });
    }
    
    if (bounty < 5) {
        return res.status(400).json({ error: '赏金至少为5' });
    }
    
    db.getUserById(creatorId, async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: '用户不存在' });
        
        if (user.balance < bounty) {
            return res.status(400).json({ error: `余额不足！当前余额: ${user.balance}，需要: ${bounty}` });
        }
        
        db.updateUserBalance(creatorId, user.balance - bounty, async (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.createTask(title, description, bounty, creatorId, images || [], (err, taskId) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, taskId });
            });
        });
    });
});

app.post('/api/tasks/:id/accept', (req, res) => {
    const { taskId, hunterId } = req.body;
    
    db.getTaskById(taskId, (err, task) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!task) return res.status(404).json({ error: '任务不存在' });
        if (task.status !== 'open') return res.status(400).json({ error: '任务不可接取' });
        if (task.creator_id == hunterId) return res.status(400).json({ error: '不能接取自己的任务' });
        
        db.acceptTask(taskId, hunterId, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/api/tasks/:id/submit', upload.array('images', 5), (req, res) => {
    const taskId = req.params.id;
    const { hunterId } = req.body;
    const imageUrls = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
    
    db.submitTask(taskId, hunterId, imageUrls, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, images: imageUrls });
    });
});

app.post('/api/tasks/:id/verify', (req, res) => {
    const { taskId, creatorId } = req.body;
    
    db.getTaskById(taskId, (err, task) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!task) return res.status(404).json({ error: '任务不存在' });
        if (task.creator_id != creatorId) return res.status(403).json({ error: '只有发布者可以审核' });
        if (task.status !== 'pending_verify') return res.status(400).json({ error: '任务状态不正确' });
        
        db.getUserById(task.hunter_id, (err, hunter) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.updateUserBalance(task.hunter_id, hunter.balance + task.bounty, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.completeTask(taskId, (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                });
            });
        });
    });
});

app.post('/api/admin/tasks/:id/verify', (req, res) => {
    const { taskId, adminId } = req.body;
    
    db.getUserById(adminId, (err, admin) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!admin || !admin.is_admin) return res.status(403).json({ error: '无权限' });
        
        db.getTaskById(taskId, (err, task) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!task) return res.status(404).json({ error: '任务不存在' });
            if (task.status !== 'pending_verify') return res.status(400).json({ error: '任务状态不正确' });
            
            db.getUserById(task.hunter_id, (err, hunter) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.updateUserBalance(task.hunter_id, hunter.balance + task.bounty, (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    db.completeTask(taskId, (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

app.delete('/api/tasks/:id', (req, res) => {
    const { taskId, creatorId } = req.body;
    
    db.getTaskById(taskId, (err, task) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!task) return res.status(404).json({ error: '任务不存在' });
        if (task.creator_id != creatorId) return res.status(403).json({ error: '只有发布者可以取消' });
        if (task.status !== 'open') return res.status(400).json({ error: '只有开放中的任务可以取消' });
        
        db.getUserById(creatorId, (err, creator) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.updateUserBalance(creatorId, creator.balance + task.bounty, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.deleteTask(taskId, (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                });
            });
        });
    });
});

app.get('/api/admin/pending-tasks', (req, res) => {
    db.getPendingTasks((err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(tasks);
    });
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});