const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

console.log("🔥 NEW SERVER FILE RUNNING with RBAC + Comments + Notifications + Activity Timeline");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));

/* ---------------- ROOT ROUTE ---------------- */
app.get("/", (req, res) => {
    res.send("ProjectHub Server Running 🚀 with RBAC + All Features");
});

/* ---------------- MongoDB CONNECTION ---------------- */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

/* ==================== SCHEMAS ==================== */

// User Schema with Role
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['project_manager', 'developer', 'designer', 'tester'],
        default: 'developer'
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Project Schema
const projectSchema = new mongoose.Schema({
    projectName: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['active', 'in-progress', 'completed'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model('Project', projectSchema);

// Task Schema with Assignment
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate: { type: Date },
    status: { type: String, enum: ['todo', 'doing', 'done', 'pending', 'completed'], default: 'todo' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedToName: { type: String, default: 'Unassigned' },
    assignedToRole: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', taskSchema);

// Team Member Schema
const teamMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    role: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    avatar: { type: String, default: '👤' },
    isActive: { type: Boolean, default: true },
    joinedDate: { type: Date, default: Date.now }
});

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

// ==================== NOTIFICATION SCHEMA ====================
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['task_assigned', 'task_updated', 'task_completed', 'comment_added', 'project_created'], default: 'task_assigned' },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// ==================== COMMENT SCHEMA ====================
const commentSchema = new mongoose.Schema({
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userRole: { type: String },
    userAvatar: { type: String },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', commentSchema);

// ==================== ACTIVITY TIMELINE SCHEMA ====================
const activityTimelineSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userRole: { type: String },
    action: { type: String, required: true },
    details: { type: String },
    oldValue: { type: String },
    newValue: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const ActivityTimeline = mongoose.model('ActivityTimeline', activityTimelineSchema);

/* ==================== MIDDLEWARE ==================== */

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, "secretkey123");
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        
        req.user = user;
        req.user.userId = user._id;
        next();
    } catch (error) {
        console.error("Auth error:", error);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Role-based Authorization Middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

/* ==================== HELPER FUNCTIONS ==================== */

function getRoleDisplay(role) {
    const roles = {
        'project_manager': 'Project Manager',
        'developer': 'Developer',
        'designer': 'Designer',
        'tester': 'Tester'
    };
    return roles[role] || 'Developer';
}

// Create notification helper function - UPDATED with projectId
async function createNotification(userId, title, message, type, relatedId, projectId) {
    try {
        const notification = new Notification({
            userId,
            title,
            message,
            type,
            relatedId,
            projectId
        });
        await notification.save();
        console.log(`📢 Notification sent to user ${userId}: ${title}`);
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}

// Add activity helper function
async function addActivity(projectId, taskId, userId, userName, userRole, action, details, oldValue = null, newValue = null) {
    try {
        const activity = new ActivityTimeline({
            projectId,
            taskId,
            userId,
            userName,
            userRole,
            action,
            details,
            oldValue,
            newValue
        });
        await activity.save();
        console.log(`📜 Activity logged: ${action} by ${userName}`);
    } catch (error) {
        console.error("Error adding activity:", error);
    }
}

/* ==================== AUTH ROUTES ==================== */

// REGISTER
app.post("/register", async (req, res) => {
    try {
        console.log("🔥 REGISTER REQUEST:", req.body);

        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'developer'
        });

        await newUser.save();
        
        const existingMember = await TeamMember.findOne({ email });
        if (!existingMember) {
            const teamMember = new TeamMember({
                name,
                email,
                role: getRoleDisplay(role),
                userId: newUser._id
            });
            await teamMember.save();
        }

        res.json({
            message: "User Registered Successfully",
            user: { id: newUser._id, name, email, role: newUser.role, createdAt: newUser.createdAt }
        });

    } catch (error) {
        console.log("❌ ERROR:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
           return res.status(400).json({ message: "User not found ❌" });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ message: "Wrong password ❌" });
        }
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            "secretkey123",
            { expiresIn: "24h" }
        );
        
        res.json({
            message: "Login Success ✅",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }
});

// Get current user
app.get("/api/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
        });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// Get All Users (for assignment)
app.get("/api/users", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const users = await User.find({}, 'name email role _id');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== PROJECT ROUTES ==================== */

// CREATE PROJECT
app.post("/create-project", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const { projectName, description, status } = req.body;

        const newProject = new Project({
            projectName,
            description,
            status: status || 'active',
            createdBy: req.user._id
        });

        await newProject.save();
        
        // Notify project manager about project creation
        await createNotification(
            req.user._id,
            'Project Created',
            `Project "${projectName}" has been created successfully`,
            'project_created',
            newProject._id,
            newProject._id
        );
        
        res.json({ message: "Project Created Successfully ✅", project: newProject });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET ALL PROJECTS
app.get("/projects", authMiddleware, async (req, res) => {
    try {
        let projects;
        
        if (req.user.role === 'project_manager') {
            projects = await Project.find();
        } else {
            const tasks = await Task.find({ assignedTo: req.user._id });
            const projectIds = [...new Set(tasks.map(t => t.projectId.toString()))];
            projects = await Project.find({ _id: { $in: projectIds } });
        }
        
        res.json(projects);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET SINGLE PROJECT
app.get("/projects/:id", authMiddleware, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        res.json(project);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// UPDATE PROJECT
app.put("/projects/:id", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const { projectName, description, status } = req.body;
        await Project.findByIdAndUpdate(req.params.id, { projectName, description, status });
        res.json({ message: "Project Updated Successfully ✅" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// DELETE PROJECT
app.delete("/projects/:id", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        await Task.deleteMany({ projectId: req.params.id });
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: "Project Deleted Successfully ✅" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== TASK ROUTES ==================== */

// CREATE TASK (with Activity & Notification)
app.post("/tasks", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        console.log("📥 Creating task:", req.body);
        
        const { title, description, priority, dueDate, projectId, assignedTo, status } = req.body;
        
        if (!title) {
            return res.status(400).json({ message: "Task title is required" });
        }
        
        if (!projectId) {
            return res.status(400).json({ message: "Project ID is required" });
        }
        
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        
        let assignedToId = null;
        let assignedToName = 'Unassigned';
        let assignedToRole = '';
        
        if (assignedTo && assignedTo !== 'Unassigned' && assignedTo !== '') {
            const isValidObjectId = mongoose.Types.ObjectId.isValid(assignedTo);
            
            if (isValidObjectId) {
                const assignedUser = await User.findById(assignedTo);
                if (assignedUser) {
                    assignedToId = assignedUser._id;
                    assignedToName = assignedUser.name;
                    assignedToRole = assignedUser.role;
                }
            } else {
                assignedToName = assignedTo;
                assignedToRole = assignedTo.toLowerCase().replace(' ', '_');
                const userByRole = await User.findOne({ role: assignedToRole });
                if (userByRole) {
                    assignedToId = userByRole._id;
                    assignedToName = userByRole.name;
                }
            }
        }

        const task = new Task({
            title,
            description: description || '',
            priority: priority || 'medium',
            dueDate: dueDate || null,
            projectId: projectId,
            assignedTo: assignedToId,
            assignedToName: assignedToName,
            assignedToRole: assignedToRole,
            createdBy: req.user._id,
            status: status || 'todo'
        });

        await task.save();
        
        // Add activity
        await addActivity(
            projectId,
            task._id,
            req.user._id,
            req.user.name,
            req.user.role,
            'created_task',
            `Created task "${title}"`
        );
        
        // Send notification to assigned user
        if (assignedToId && assignedToId.toString() !== req.user._id.toString()) {
            await createNotification(
                assignedToId,
                'New Task Assigned',
                `${req.user.name} assigned you to "${title}" in ${project.projectName}`,
                'task_assigned',
                task._id,
                projectId
            );
        }
        
        res.status(201).json({ message: "Task Created Successfully ✅", task });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ message: "Server Error: " + error.message });
    }
});

// GET TASKS FOR PROJECT
app.get("/tasks", authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.query;
        
        if (!projectId) {
            return res.status(400).json({ message: "Project ID is required" });
        }
        
        let tasks;
        
        if (req.user.role === 'project_manager') {
            tasks = await Task.find({ projectId: projectId });
        } else {
            tasks = await Task.find({ 
                projectId: projectId,
                assignedTo: req.user._id
            });
        }
        
        res.json(tasks);
        
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET SINGLE TASK
app.get("/tasks/:id", authMiddleware, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// UPDATE TASK (with Activity)
app.put("/tasks/:id", authMiddleware, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        
        if (req.user.role !== 'project_manager' && task.assignedTo?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        const { title, description, priority, dueDate, status, assignedTo } = req.body;
        
        let updateData = { title, description, priority, dueDate, status };
        let activityDetails = [];
        
        if (title && title !== task.title) {
            activityDetails.push(`Title changed from "${task.title}" to "${title}"`);
        }
        if (status && status !== task.status) {
            activityDetails.push(`Status changed from ${task.status} to ${status}`);
        }
        if (priority && priority !== task.priority) {
            activityDetails.push(`Priority changed from ${task.priority} to ${priority}`);
        }
        
        if (req.user.role === 'project_manager' && assignedTo !== undefined) {
            let assignedToId = null;
            let assignedToName = 'Unassigned';
            let assignedToRole = '';
            
            if (assignedTo && assignedTo !== 'Unassigned' && assignedTo !== '') {
                const isValidObjectId = mongoose.Types.ObjectId.isValid(assignedTo);
                
                if (isValidObjectId) {
                    const assignedUser = await User.findById(assignedTo);
                    if (assignedUser) {
                        assignedToId = assignedUser._id;
                        assignedToName = assignedUser.name;
                        assignedToRole = assignedUser.role;
                    }
                } else {
                    assignedToName = assignedTo;
                    assignedToRole = assignedTo.toLowerCase().replace(' ', '_');
                    const userByRole = await User.findOne({ role: assignedToRole });
                    if (userByRole) {
                        assignedToId = userByRole._id;
                    }
                }
            }
            
            if (assignedToId?.toString() !== task.assignedTo?.toString()) {
                activityDetails.push(`Assigned to changed from ${task.assignedToName || 'Unassigned'} to ${assignedToName}`);
                
                if (assignedToId && assignedToId.toString() !== req.user._id.toString()) {
                    const project = await Project.findById(task.projectId);
                    await createNotification(
                        assignedToId,
                        'Task Assigned to You',
                        `${req.user.name} assigned you to "${task.title}" in ${project?.projectName || 'project'}`,
                        'task_assigned',
                        task._id,
                        task.projectId
                    );
                }
            }
            
            updateData.assignedTo = assignedToId;
            updateData.assignedToName = assignedToName;
            updateData.assignedToRole = assignedToRole;
        }
        
        await Task.findByIdAndUpdate(req.params.id, updateData);
        
        if (activityDetails.length > 0) {
            await addActivity(
                task.projectId,
                task._id,
                req.user._id,
                req.user.name,
                req.user.role,
                'updated_task',
                activityDetails.join(', ')
            );
        }

        res.json({ message: "Task Updated Successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// MOVE TASK (Drag and Drop with Activity)
app.patch("/tasks/:id/move", authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const task = await Task.findById(req.params.id);
        
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        
        const oldStatus = task.status;
        
        await Task.findByIdAndUpdate(req.params.id, { status });
        
        await addActivity(
            task.projectId,
            task._id,
            req.user._id,
            req.user.name,
            req.user.role,
            'moved_task',
            `Moved task from ${oldStatus} to ${status}`,
            oldStatus,
            status
        );
        
        res.json({ message: "Task moved successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// DELETE TASK
app.delete("/tasks/:id", authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        
        if (task) {
            await addActivity(
                task.projectId,
                task._id,
                req.user._id,
                req.user.name,
                req.user.role,
                'deleted_task',
                `Deleted task "${task.title}"`
            );
            
            await Comment.deleteMany({ taskId: req.params.id });
        }
        
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: "Task Deleted Successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET MY TASKS
app.get("/api/my-tasks", authMiddleware, async (req, res) => {
    try {
        let tasks;
        
        if (req.user.role === 'project_manager') {
            tasks = await Task.find().populate('projectId', 'projectName');
        } else {
            tasks = await Task.find({ assignedTo: req.user._id }).populate('projectId', 'projectName');
        }
        
        res.json(tasks);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== NOTIFICATION ROUTES ==================== */

app.get("/api/notifications", authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.put("/api/notifications/:id/read", authMiddleware, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.put("/api/notifications/read-all", authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user._id }, { isRead: true });
        res.json({ message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== COMMENT ROUTES ==================== */

// GET COMMENTS FOR A TASK (Single, unified version)
app.get("/api/tasks/:taskId/comments", authMiddleware, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        
        // Check if user has access to this task's project
        const project = await Project.findById(task.projectId);
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        
        // Allow access if:
        // 1. User is Project Manager (can see all)
        // 2. User is assigned to this task
        // 3. User is part of the project (has tasks in it)
        let hasAccess = false;
        
        if (req.user.role === 'project_manager') {
            hasAccess = true;
        } else if (task.assignedTo && task.assignedTo.toString() === req.user._id.toString()) {
            hasAccess = true;
        } else {
            // Check if user has any task in this project
            const userTasks = await Task.find({ 
                projectId: task.projectId,
                assignedTo: req.user._id
            });
            if (userTasks.length > 0) {
                hasAccess = true;
            }
        }
        
        if (!hasAccess) {
            return res.status(403).json({ message: "Access denied to these comments" });
        }
        
        // Return ALL comments for this task
        const comments = await Comment.find({ taskId: req.params.taskId })
            .sort({ createdAt: -1 });
        
        res.json(comments);
    } catch (error) {
        console.error("Error loading comments:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ADD COMMENT TO TASK (with notifications to ALL team members)
app.post("/api/tasks/:taskId/comments", authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        const taskId = req.params.taskId;
        
        const task = await Task.findById(taskId).populate('projectId');
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        
        const comment = new Comment({
            taskId: taskId,
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            userAvatar: req.user.name.charAt(0).toUpperCase(),
            content
        });
        
        await comment.save();
        
        // Add to activity timeline
        await addActivity(
            task.projectId,
            taskId,
            req.user._id,
            req.user.name,
            req.user.role,
            'added_comment',
            `Added a comment: "${content.substring(0, 50)}..."`
        );
        
        // ✅ NOTIFICATION LOGIC: Notify ALL team members in this project
        // 1. Get all users who have tasks in this project
        const projectTasks = await Task.find({ projectId: task.projectId });
        const userIdsWithTasks = [...new Set(projectTasks.map(t => t.assignedTo?.toString()).filter(id => id))];
        
        // 2. Also get the project manager (creator)
        const project = await Project.findById(task.projectId);
        const projectManagerId = project.createdBy?.toString();
        
        // 3. Combine unique users to notify
        const usersToNotify = [...new Set([...userIdsWithTasks, projectManagerId])];
        
        // 4. Send notification to everyone except the commenter
        for (const userId of usersToNotify) {
            if (userId && userId !== req.user._id.toString()) {
                await createNotification(
                    userId,
                    `New Comment on "${task.title}"`,
                    `${req.user.name} (${getRoleDisplay(req.user.role)}) commented: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`,
                    'comment_added',
                    taskId,
                    task.projectId
                );
            }
        }
        
        res.status(201).json(comment);
    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== ACTIVITY TIMELINE ROUTES ==================== */

app.get("/api/tasks/:taskId/activities", authMiddleware, async (req, res) => {
    try {
        const activities = await ActivityTimeline.find({ taskId: req.params.taskId })
            .sort({ createdAt: -1 });
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.get("/api/projects/:projectId/activities", authMiddleware, async (req, res) => {
    try {
        const activities = await ActivityTimeline.find({ projectId: req.params.projectId })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

/* ==================== TEAM MEMBER ROUTES ==================== */

app.get('/api/team-members', authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const members = await TeamMember.find({ isActive: true });
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/team-members', authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        const member = new TeamMember(req.body);
        await member.save();
        res.json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/team-members/:id', authMiddleware, authorize('project_manager'), async (req, res) => {
    try {
        await TeamMember.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Member removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ==================== TEST ROUTE ==================== */

app.get("/test", (req, res) => {
    res.send("TEST OK with all features");
});

/* ==================== SERVER START ==================== */

app.listen(5000, () => {
    console.log("🚀 Server running on port 5000 with all features enabled!");
    console.log("✅ RBAC - Role Based Access Control");
    console.log("✅ Notifications - Real-time alerts to ALL team members");
    console.log("✅ Comments - Task discussions with @mentions style");
    console.log("✅ Activity Timeline - Complete history");
});