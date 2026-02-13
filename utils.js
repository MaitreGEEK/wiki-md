import { readFileSync } from "fs";
import { join } from "path";

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

export function getMimeType(path) {
	const ext = path.substring(path.lastIndexOf("."));
	return MIME_TYPES[ext] || "application/octet-stream";
}

export function serveStatic(path) {
	try {
		const content = readFileSync(join(process.cwd(), "public", path));
		return new Response(content, {
			headers: { "Content-Type": getMimeType(path) },
		});
	} catch {
		return new Response("Not Found", { status: 404 });
	}
}

export function renderView(viewName, data = {}) {
	try {
		let html = readFileSync(
			join(process.cwd(), "views", `${viewName}.html`),
			"utf-8",
		);

		// Handle {{#if variable}} ... {{else}} ... {{/if}} blocks FIRST
		html = html.replace(
			/{{#if\s+(\w+)}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g,
			(_, variable, trueContent, falseContent) => {
				return data[variable] ? trueContent : falseContent;
			},
		);

		// Then handle {{#if variable}} ... {{/if}} blocks (without else)
		html = html.replace(
			/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g,
			(_, variable, content) => {
				return data[variable] ? content : "";
			},
		);

		// Handle {{#unless variable}} ... {{/unless}} blocks
		html = html.replace(
			/{{#unless\s+(\w+)}}([\s\S]*?){{\/unless}}/g,
			(_, variable, content) => {
				return !data[variable] ? content : "";
			},
		);

		// Replace provided variables
		for (const [key, value] of Object.entries(data)) {
			const regex = new RegExp(`{{${key}}}`, "g");
			html = html.replace(regex, value ?? "");
		}

		// Remove all remaining empty template variables
		html = html.replace(/{{[^}]+}}/g, "");

		return new Response(html, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	} catch (error) {
		console.error(`Error rendering view ${viewName}:`, error);
		return new Response("Internal Server Error", { status: 500 });
	}
}

export function slugify(text) {
	return text
		.toString()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function generateToken() {
	return crypto.randomUUID();
}

export function generateSecurePassword() {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
	let password = "";
	for (let i = 0; i < 16; i++) {
		password += chars[Math.floor(Math.random() * chars.length)];
	}
	return password;
}

export function canAccessContent(
	visibility,
	userRole,
	providedPassword,
	contentPassword,
) {
	if (visibility === "public") return true;
	if (visibility === "logged" && userRole) return true;
	if (visibility === "password") return providedPassword === contentPassword;
	if (visibility === "editor")
		return userRole === "editor" || userRole === "admin";
	if (visibility === "admin") return userRole === "admin";
	return false;
}

export function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
