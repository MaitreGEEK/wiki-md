import { getUser, createUser } from "./db.js";

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 jours

export function hashPassword(password) {
	return Bun.password.hashSync(password, {
		algorithm: "bcrypt",
		cost: 10,
	});
}

export function verifyPassword(password, hash) {
	return Bun.password.verifySync(password, hash);
}

export function createSession(userId, role) {
	const expires = new Date(Date.now() + SESSION_DURATION);
	return {
		value: JSON.stringify({ userId, role, expires: expires.getTime() }),
		expires,
		httpOnly: true,
		sameSite: "lax",
		path: "/",
	};
}

export function parseSession(cookie) {
	if (!cookie) return null;
	try {
		const session = JSON.parse(cookie);
		if (session.expires < Date.now()) return null;
		return session;
	} catch {
		return null;
	}
}

export function authenticateUser(username, password) {
	const user = getUser.get(username);
	if (!user) return null;
	if (!verifyPassword(password, user.password)) return null;
	return user;
}

export function initializeAdminUsers() {
	const adminList = process.env.LIST_ADMIN;
	if (!adminList) return;

	const admins = adminList.split(",").map((entry) => {
		const [username, password] = entry.split(":");
		return { username: username.trim(), password: password.trim() };
	});

	for (const admin of admins) {
		const existingUser = getUser.get(admin.username);
		if (!existingUser) {
			const hashedPassword = hashPassword(admin.password);
			createUser.run(admin.username, hashedPassword, admin.username, "admin");
			console.log(`Admin user created: ${admin.username}`);
		}
	}
}
