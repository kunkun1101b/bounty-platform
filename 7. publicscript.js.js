let currentUser = null;
let tasks = [];

const API_BASE = '';

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('bounty_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUserDisplay();
        if (currentUser.isAdmin) {
            document.getElementById('adminPanelBtn').style.display = 'inline-block';
        }
        loadTasks();
    } else {
        document.getElementById('loginModal').style.display = 'flex';
    }
    
    setupEventListeners();
});

function updateUserDisplay() {
    document.getElementById('userDisplay').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username} (💰${currentUser.balance})`;
    document.getElementById('userBalance').innerText = currentUser.balance;
}

async function updateUserInfo() {
    const res = await fetch(`${API_BASE}/api/user/${currentUser.id}`);
    const user = await res.json();
    currentUser.balance = user.balance;
    localStorage.setItem('bounty_user', JSON.stringify(currentUser));
    updateUserDisplay();
}

function setupEventListeners() {
    document.getElementById('loginBtn').onclick = async () => {
        const username = document.getElementById('loginUsername').value.trim();
        if (!username) {
            alert('请输入用户名');
            return;
        }
        
        const res = await fetch(`${API_BASE}/api/user/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('bounty_user', JSON.stringify(currentUser));
            document.getElementById('loginModal').style.display = 'none';
            updateUserDisplay();
            if (currentUser.isAdmin) {
                document.getElementById('adminPanelBtn').style.display = 'inline-block';
            }
            loadTasks();
        }
    };
    
    document.getElementById('openCreateModalBtn').onclick = () => {
        if (!currentUser) {
            alert('请先登录');
            return;
        }
        document.getElementById('createModal').style.display = 'flex';
    };
    
    document.getElementById('closeModalBtn').onclick = () => {
        document.getElementById('createModal').style.display = 'none';
        document.getElementById('createTaskForm').reset();
    };
    
    document.getElementById('adminPanelBtn').onclick = async () => {
        if (!currentUser?.isAdmin) {
            alert('无权限');
            return;
        }
        await loadAdminPanel();
        document.getElementById('adminModal').style.display = 'flex';
    };
    
    document.getElementById('closeAdminBtn').onclick = () => {
        document.getElementById('adminModal').style.display = 'none';
    };
    
    document.getElementById('filterStatus').addEventListener('change', renderTasks);
    
    document.getElementById('createTaskForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDesc').value.trim();
        const bounty = parseInt(document.getElementById('taskBounty').value);
        
        if (!title || !description) {
            alert('请填写完整信息');
            return;
        }
        
        if (bounty < 5) {
            alert('赏金至少为5');
            return;
        }
        
        const res = await fetch(`${API_BASE}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title, description, bounty, creatorId: currentUser.id, images: [] 
            })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            alert(`✅ 任务发布成功！扣除 ${bounty} BOUNTY`);
            document.getElementById('createModal').style.display = 'none';
            document.getElementById('createTaskForm').reset();
            await loadTasks();
            await updateUserInfo();
        } else {
            alert(data.error || '发布失败，请检查余额是否充足');
        }
    };
}

async function loadTasks() {
    try {
        const res = await fetch(`${API_BASE}/api/tasks`);
        tasks = await res.json();
        updateStats();
        renderTasks();
        renderMyTasks();
    } catch (err) {
        console.error('加载任务失败:', err);
        document.getElementById('tasksListContainer').innerHTML = '<div class="empty-msg">加载失败，请刷新页面</div>';
    }
}

function updateStats() {
    document.getElementById('totalBounties').innerText = tasks.length;
    document.getElementById('openBounties').innerText = tasks.filter(t => t.status === 'open').length;
    const totalReward = tasks.reduce((sum, t) => sum + t.bounty, 0);
    document.getElementById('totalReward').innerText = totalReward;
}

function renderTasks() {
    const filterValue = document.getElementById('filterStatus').value;
    let filtered = filterValue === 'all' ? tasks : tasks.filter(t => t.status === filterValue);
    const container = document.getElementById('tasksListContainer');
    
    if (!filtered.length) {
        container.innerHTML = '<div class="empty-msg">📭 暂无任务，点击右上角"发布悬赏"创建第一个任务！</div>';
        return;
    }
    
    container.innerHTML = filtered.map(task => {
        let statusClass = '';
        let statusText = '';
        switch(task.status) {
            case 'open': statusText = '开放中'; statusClass = 'status-open'; break;
            case 'in_progress': statusText = '进行中'; statusClass = 'status-inprogress'; break;
            case 'pending_verify': statusText = '待审核'; statusClass = 'status-pending_verify'; break;
            case 'completed': statusText = '已完成'; statusClass = 'status-completed'; break;
        }
        
        const images = task.images ? JSON.parse(task.images) : [];
        const submitImages = task.submit_images ? JSON.parse(task.submit_images || '[]') : [];
        const canAccept = task.status === 'open' && !task.hunter_id && task.creator_id !== currentUser?.id;
        const canSubmit = task.status === 'in_progress' && task.hunter_id === currentUser?.id;
        const canVerifyCreator = task.status === 'pending_verify' && task.creator_id === currentUser?.id;
        const isCreator = task.creator_id === currentUser?.id;
        
        return `
            <div class="task-item">
                <div class="task-title">
                    <span>${escapeHtml(task.title)}</span>
                    <span class="task-bounty">💰 ${task.bounty} BOUNTY</span>
                </div>
                <div class="task-desc">${escapeHtml(task.description)}</div>
                ${images.length ? `<div class="task-images">${images.map(img => `<img src="${img}" class="task-img-preview" onclick="window.open('${img}')">`).join('')}</div>` : ''}
                ${submitImages.length ? `<div class="task-images">📎 完成凭证: ${submitImages.map(img => `<img src="${img}" class="task-img-preview">`).join('')}</div>` : ''}
                <div class="task-meta">
                    <span>状态: <span class="status-badge ${statusClass}">${statusText}</span></span>
                    <span>📝 发布者: ${task.creator_name || '用户' + task.creator_id}</span>
                    ${task.hunter_name ? `<span>🔨 接单者: ${task.hunter_name}</span>` : ''}
                </div>
                <div class="task-actions">
                    ${canAccept ? `<button class="btn-primary" onclick="acceptTask(${task.id})">🎯 接取悬赏</button>` : ''}
                    ${canSubmit ? `<button class="btn-success" onclick="openSubmitModal(${task.id})">📤 提交完成</button>` : ''}
                    ${canVerifyCreator ? `<button class="btn-primary" onclick="verifyTask(${task.id})">✅ 审核通过</button>` : ''}
                    ${isCreator && task.status === 'open' ? `<button class="btn-danger" onclick="cancelTask(${task.id})">❌ 取消任务</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderMyTasks() {
    const myTasks = tasks.filter(t => t.hunter_id === currentUser?.id);
    const container = document.getElementById('myTasksList');
    
    if (!myTasks.length) {
        container.innerHTML = '<div class="empty-msg">暂无接单任务，去任务榜接取吧！</div>';
        return;
    }
    
    container.innerHTML = myTasks.map(task => `
        <div class="my-task-item">
            <strong>${escapeHtml(task.title)}</strong>
            <div>💰 赏金: ${task.bounty} · 📌 状态: ${task.status}</div>
        </div>
    `).join('');
}

async function acceptTask(taskId) {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, hunterId: currentUser.id })
    });
    
    if (res.ok) {
        alert('🎉 接取成功！请在「我的工单」中跟进任务');
        await loadTasks();
    } else {
        const error = await res.json();
        alert(error.error || '接取失败');
    }
}

let currentSubmitTaskId = null;

function openSubmitModal(taskId) {
    currentSubmitTaskId = taskId;
    document.getElementById('submitModal').style.display = 'flex';
}

document.getElementById('submitDropZone')?.addEventListener('click', () => {
    document.getElementById('submitFileInput').click();
});

document.getElementById('confirmSubmitBtn')?.addEventListener('click', async () => {
    if (!currentSubmitTaskId) return;
    
    const formData = new FormData();
    formData.append('hunterId', currentUser.id);
    const files = document.getElementById('submitFileInput').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }
    
    const res = await fetch(`${API_BASE}/api/tasks/${currentSubmitTaskId}/submit`, {
        method: 'POST',
        body: formData
    });
    
    if (res.ok) {
        alert('📋 提交成功，等待发布者审核！');
        document.getElementById('submitModal').style.display = 'none';
        document.getElementById('submitFileInput').value = '';
        document.getElementById('submitPreviewList').innerHTML = '';
        await loadTasks();
    } else {
        alert('提交失败');
    }
});

document.getElementById('closeSubmitModal')?.addEventListener('click', () => {
    document.getElementById('submitModal').style.display = 'none';
});

document.getElementById('submitFileInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const previewContainer = document.getElementById('submitPreviewList');
    previewContainer.innerHTML = '';
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.createElement('img');
            img.src = ev.target.result;
            img.className = 'preview-img';
            previewContainer.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

async function verifyTask(taskId) {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, creatorId: currentUser.id })
    });
    
    if (res.ok) {
        alert('✅ 审核通过，赏金已支付给接单者！');
        await loadTasks();
        await updateUserInfo();
    } else {
        const error = await res.json();
        alert(error.error || '审核失败');
    }
}

async function cancelTask(taskId) {
    if (!confirm('确定取消此任务吗？赏金将返还到您的账户')) return;
    
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, creatorId: currentUser.id })
    });
    
    if (res.ok) {
        alert('任务已取消，赏金已返还');
        await loadTasks();
        await updateUserInfo();
    } else {
        alert('取消失败');
    }
}

async function loadAdminPanel() {
    const res = await fetch(`${API_BASE}/api/admin/pending-tasks`);
    const pendingTasks = await res.json();
    const container = document.getElementById('adminPendingList');
    
    if (!pendingTasks.length) {
        container.innerHTML = '<div class="empty-msg">暂无待审核任务</div>';
        return;
    }
    
    container.innerHTML = pendingTasks.map(task => `
        <div style="background:#fef9e3; border-radius:16px; padding:16px; margin-bottom:16px;">
            <strong>${escapeHtml(task.title)}</strong>
            <div>发布者: ${task.creator_name} | 接单者: ${task.hunter_name} | 赏金: ${task.bounty}</div>
            <div class="task-desc">${escapeHtml(task.description)}</div>
            <button class="btn-primary" onclick="adminVerifyTask(${task.id})">✅ 审核通过并支付</button>
        </div>
    `).join('');
}

async function adminVerifyTask(taskId) {
    const res = await fetch(`${API_BASE}/api/admin/tasks/${taskId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, adminId: currentUser.id })
    });
    
    if (res.ok) {
        alert('✅ 审核通过！');
        await loadAdminPanel();
        await loadTasks();
    } else {
        alert('操作失败');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}