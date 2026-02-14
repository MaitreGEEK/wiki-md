import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const dbPath = process.env.DATA_DIRECTORY
	? `${process.env.DATA_DIRECTORY}/wiki.db`
	: "./data/wiki.db";
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL CHECK(role IN ('reader', 'editor', 'admin')),
        profile_image TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        folder_id INTEGER,
        visibility TEXT NOT NULL CHECK(visibility IN ('public', 'logged', 'password', 'private')),
        password TEXT,
        image TEXT,
        description TEXT,
        author_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        visibility TEXT NOT NULL CHECK(visibility IN ('public', 'logged', 'password', 'private')),
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        used INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
    CREATE INDEX IF NOT EXISTS idx_articles_folder ON articles(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folders_slug ON folders(slug);
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
`);

export const getUser = db.prepare("SELECT * FROM users WHERE username = ?");
export const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
export const getAllUsers = db.prepare(
	"SELECT id, username, display_name, role, created_at FROM users",
);
export const createUser = db.prepare(
	"INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)",
);
export const updateUser = db.prepare(
	"UPDATE users SET display_name = ?, profile_image = ?, description = ? WHERE id = ?",
);
export const updateUserPassword = db.prepare(
	"UPDATE users SET password = ? WHERE id = ?",
);
export const updateUserRole = db.prepare(
	"UPDATE users SET role = ? WHERE id = ?",
);
export const deleteUser = db.prepare("DELETE FROM users WHERE id = ?");

export const getArticle = db.prepare("SELECT * FROM articles WHERE slug = ?");
export const getArticleById = db.prepare("SELECT * FROM articles WHERE id = ?");
export const getAllArticles = db.prepare(
	"SELECT * FROM articles ORDER BY created_at DESC",
);
export const getArticlesByFolder = db.prepare(
	"SELECT * FROM articles WHERE folder_id = ? ORDER BY created_at DESC",
);
export const searchArticles = db.prepare(
	"SELECT * FROM articles WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC",
);
export const createArticle = db.prepare(
	"INSERT INTO articles (slug, title, content, folder_id, visibility, password, image, description, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
export const updateArticle = db.prepare(
	"UPDATE articles SET title = ?, content = ?, folder_id = ?, visibility = ?, password = ?, image = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
);
export const deleteArticle = db.prepare("DELETE FROM articles WHERE id = ?");

export const getFolder = db.prepare("SELECT * FROM folders WHERE slug = ?");
export const getFolderById = db.prepare("SELECT * FROM folders WHERE id = ?");
export const getAllFolders = db.prepare(
	"SELECT * FROM folders ORDER BY name ASC",
);
export const createFolder = db.prepare(
	"INSERT INTO folders (slug, name, description, visibility, password) VALUES (?, ?, ?, ?, ?)",
);
export const updateFolder = db.prepare(
	"UPDATE folders SET name = ?, description = ?, visibility = ?, password = ? WHERE id = ?",
);
export const deleteFolder = db.prepare("DELETE FROM folders WHERE id = ?");

export const createInvitation = db.prepare(
	"INSERT INTO invitations (token, role, expires_at) VALUES (?, ?, ?)",
);
export const getInvitation = db.prepare(
	"SELECT * FROM invitations WHERE token = ? AND used = 0",
);
export const markInvitationUsed = db.prepare(
	"UPDATE invitations SET used = 1 WHERE token = ?",
);
export const deleteInvitation = db.prepare(
	"DELETE FROM invitations WHERE id = ?",
);
export const cleanExpiredInvitations = db.prepare(
	"DELETE FROM invitations WHERE expires_at < datetime('now')",
);

export default db;
