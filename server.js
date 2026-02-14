import {
	parseSession,
	authenticateUser,
	createSession,
	initializeAdminUsers,
	hashPassword,
} from "./auth.js";
import {
	getUserById,
	getAllUsers,
	createUser,
	updateUser,
	updateUserPassword,
	updateUserRole,
	deleteUser,
	getArticle,
	getAllArticles,
	getArticlesByFolder,
	searchArticles,
	createArticle,
	updateArticle,
	deleteArticle,
	getFolder,
	getFolderById,
	getAllFolders,
	createFolder,
	updateFolder,
	deleteFolder,
	updateFolderPosition,
	updateArticlePosition,
	getInvitation,
	createInvitation,
	markInvitationUsed,
	cleanExpiredInvitations,
} from "./db.js";
import {
	serveStatic,
	renderView,
	slugify,
	generateToken,
	generateSecurePassword,
	canAccessContent,
	jsonResponse,
} from "./utils.js";
import { renderMarkdown, escapeHtml } from "./markdown.js";
import * as fs from "node:fs";
import { join, extname } from "node:path";
import db from "./db.js";

const DATA_DIRECTORY = process.env.DATA_DIRECTORY || "./data/";
const PORT = process.env.PORT || 3000;

initializeAdminUsers();
cleanExpiredInvitations.run();

const hasPasswordAccess = (req, type, slug) => {
	const cookies = req.headers.get("cookie");
	const passwordCookie = cookies
		?.split(";")
		.find((c) => c.trim().startsWith(`pwd_${type}_${slug}=`));
	return !!passwordCookie;
};

const getSession = (req) => {
	const cookies = req.headers.get("cookie");
	const sessionCookie = cookies
		?.split(";")
		.find((c) => c.trim().startsWith("session="))
		?.split("=")[1];
	const session = parseSession(sessionCookie);
	return session ? getUserById.get(session.userId) : null;
};

Bun.serve({
	port: PORT,
	routes: {
		"/public/styles.css": () => serveStatic("styles.css"),

		"/uploads/:filename": (req) => {
			const { filename } = req.params;

			if (filename.includes("..") || filename.includes("/")) {
				return new Response("Forbidden", { status: 403 });
			}

			const filepath = join(DATA_DIRECTORY, "uploads", filename);
			if (!fs.existsSync(filepath)) {
				return new Response("Not Found", { status: 404 });
			}

			return new Response(Bun.file(filepath));
		},

		"/api/login": {
			POST: async (req) => {
				const body = await req.json();
				const authenticatedUser = authenticateUser(
					body.username,
					body.password,
				);

				if (!authenticatedUser) {
					return jsonResponse({ error: "Invalid credentials" }, 401);
				}

				const sessionData = createSession(
					authenticatedUser.id,
					authenticatedUser.role,
				);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": `session=${sessionData.value}; Path=/; HttpOnly; SameSite=Lax; Expires=${sessionData.expires.toUTCString()}`,
					},
				});
			},
		},

		"/api/verify-password": {
			POST: async (req) => {
				const { type, slug, password } = await req.json();

				let resource;
				if (type === "article") {
					resource = getArticle.get(slug);
				} else if (type === "folder") {
					resource = getFolder.get(slug);
				}

				if (!resource) {
					return jsonResponse({ error: "Not found" }, 404);
				}

				if (resource.password === password) {
					const token = generateToken();
					const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: {
							"Content-Type": "application/json",
							"Set-Cookie": `pwd_${type}_${slug}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`,
						},
					});
				}

				return jsonResponse({ success: false }, 401);
			},
		},

		"/api/logout": {
			POST: () => {
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
					},
				});
			},
		},

		"/api/upload-image": {
			POST: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Unauthorized" }, 401);
				}

				try {
					const formData = await req.formData();
					const file = formData.get("image");

					if (!file) {
						return jsonResponse({ error: "Aucune image fournie" }, 400);
					}

					const uploadsDir = join(DATA_DIRECTORY, "uploads");
					if (!fs.existsSync(uploadsDir)) {
						fs.mkdirSync(uploadsDir, { recursive: true });
					}

					const ext = extname(file.name);
					const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
					const filepath = join(uploadsDir, filename);

					const buffer = await file.arrayBuffer();
					fs.writeFileSync(filepath, Buffer.from(buffer));

					return jsonResponse({ url: `/uploads/${filename}` });
				} catch (error) {
					console.error("Erreur upload image:", error);
					return jsonResponse({ error: "Erreur lors de l'upload" }, 500);
				}
			},
		},

		"/api/invitation/:token": {
			POST: async (req) => {
				const { token } = req.params;
				const invitation = getInvitation.get(token);

				if (!invitation) {
					return jsonResponse({ error: "Invalid or expired invitation" }, 404);
				}

				const body = await req.json();
				const hashedPassword = hashPassword(body.password);

				try {
					createUser.run(
						body.username,
						hashedPassword,
						body.display_name || body.username,
						invitation.role,
					);
					markInvitationUsed.run(token);
					return jsonResponse({ success: true });
				} catch {
					return jsonResponse({ error: "Username already exists" }, 400);
				}
			},
		},

		"/api/articles": {
			GET: (req) => {
				const user = getSession(req);
				const articles = getAllArticles.all();
				const filtered = articles.filter((article) =>
					canAccessContent(article.visibility, user?.role, null, null),
				);
				return jsonResponse(filtered);
			},
			POST: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const body = await req.json();
				const slug = body.slug || slugify(body.title);

				try {
					createArticle.run(
						slug,
						body.title,
						body.content,
						body.folder_id || null,
						body.visibility,
						body.visibility === "password" ? body.password || null : null,
						body.image || null,
						body.description || null,
						user.id,
						body.folder_id || null, // position auto-calculée dans la DB
					);
					return jsonResponse({ success: true, slug });
				} catch (e) {
					console.error("Error creating article:", e);
					return jsonResponse(
						{ error: "Article with this slug already exists" },
						400,
					);
				}
			},
		},

		"/api/articles/:id": {
			PUT: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				const body = await req.json();

				updateArticle.run(
					body.title,
					body.content,
					body.folder_id || null,
					body.visibility,
					body.visibility === "password" ? body.password || null : null,
					body.image || null,
					body.description || null,
					id,
				);

				return jsonResponse({ success: true });
			},
			DELETE: (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				deleteArticle.run(id);
				return jsonResponse({ success: true });
			},
		},

		"/api/folders": {
			GET: (req) => {
				const user = getSession(req);
				const folders = getAllFolders.all();
				const filtered = folders.filter((folder) =>
					canAccessContent(folder.visibility, user?.role, null, null),
				);
				return jsonResponse(filtered);
			},
			POST: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const body = await req.json();
				const slug = body.slug || slugify(body.name);

				try {
					createFolder.run(
						slug,
						body.name,
						body.description || null,
						body.visibility,
						body.visibility === "password" ? body.password || null : null,
					);
					return jsonResponse({ success: true, slug });
				} catch {
					return jsonResponse(
						{ error: "Folder with this slug already exists" },
						400,
					);
				}
			},
		},

		"/api/folders/:id": {
			PUT: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				const body = await req.json();
				updateFolder.run(
					body.name,
					body.description || null,
					body.visibility,
					body.visibility === "password" ? body.password || null : null,
					id,
				);
				return jsonResponse({ success: true });
			},
			DELETE: (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				deleteFolder.run(id);
				return jsonResponse({ success: true });
			},
		},

		// Reorder dossiers
		"/api/folders/reorder": {
			PUT: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const { orderedIds } = await req.json();
				if (!Array.isArray(orderedIds)) {
					return jsonResponse({ error: "Bad payload" }, 400);
				}

				const tx = db.transaction((ids) => {
					ids.forEach((id, idx) => updateFolderPosition.run(idx, id));
				});
				tx(orderedIds);

				return jsonResponse({ success: true });
			},
		},

		// Reorder articles dans un dossier
		"/api/folders/:id/articles/reorder": {
			PUT: async (req) => {
				const user = getSession(req);
				if (!user || (user.role !== "editor" && user.role !== "admin")) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const folderId = parseInt(req.params.id);
				const { orderedArticleIds } = await req.json();

				if (!Number.isInteger(folderId) || !Array.isArray(orderedArticleIds)) {
					return jsonResponse({ error: "Bad payload" }, 400);
				}

				// Validation: tous les articles appartiennent bien au dossier
				const existing = getArticlesByFolder.all(folderId).map((a) => a.id);
				const allowed = new Set(existing);
				for (const id of orderedArticleIds) {
					if (!allowed.has(id)) {
						return jsonResponse({ error: "Invalid article in reorder" }, 400);
					}
				}

				const tx = db.transaction((ids) => {
					ids.forEach((id, idx) => updateArticlePosition.run(idx, id));
				});
				tx(orderedArticleIds);

				return jsonResponse({ success: true });
			},
		},

		"/api/search": {
			GET: (req) => {
				const user = getSession(req);
				const url = new URL(req.url);
				const query = url.searchParams.get("q");
				const results = searchArticles.all(`%${query}%`, `%${query}%`);

				const filtered = results.filter((article) =>
					canAccessContent(article.visibility, user?.role, null, null),
				);

				return jsonResponse(filtered);
			},
		},

		"/api/profile": {
			POST: async (req) => {
				const user = getSession(req);
				if (!user) {
					return jsonResponse({ error: "Unauthorized" }, 401);
				}

				const body = await req.json();
				updateUser.run(
					body.display_name,
					body.profile_image,
					body.description,
					user.id,
				);

				if (body.new_password) {
					const hashedPassword = hashPassword(body.new_password);
					updateUserPassword.run(hashedPassword, user.id);
				}

				return jsonResponse({ success: true });
			},
		},

		"/api/users": {
			GET: (req) => {
				const user = getSession(req);
				if (!user || user.role !== "admin") {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const users = getAllUsers.all();
				return jsonResponse(users);
			},
			POST: async (req) => {
				const user = getSession(req);
				if (!user || user.role !== "admin") {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const body = await req.json();
				const url = new URL(req.url);

				if (body.generate_password) {
					const password = generateSecurePassword();
					const hashedPassword = hashPassword(password);

					try {
						createUser.run(
							body.username,
							hashedPassword,
							body.display_name || body.username,
							body.role,
						);
						return jsonResponse({ success: true, password });
					} catch {
						return jsonResponse({ error: "Username already exists" }, 400);
					}
				} else if (body.password) {
					const hashedPassword = hashPassword(body.password);

					try {
						createUser.run(
							body.username,
							hashedPassword,
							body.display_name || body.username,
							body.role,
						);
						return jsonResponse({ success: true });
					} catch {
						return jsonResponse({ error: "Username already exists" }, 400);
					}
				} else {
					const token = generateToken();
					const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
					createInvitation.run(token, body.role, expires.toISOString());
					const inviteLink = `${url.origin}/invite/${token}`;
					return jsonResponse({ success: true, inviteLink });
				}
			},
		},

		"/api/users/:id": {
			PUT: async (req) => {
				const user = getSession(req);
				if (!user || user.role !== "admin") {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				const body = await req.json();

				if (body.password) {
					const hashedPassword = hashPassword(body.password);
					updateUserPassword.run(hashedPassword, id);
				}

				if (body.role) {
					updateUserRole.run(body.role, id);
				}

				return jsonResponse({ success: true });
			},
			DELETE: (req) => {
				const user = getSession(req);
				if (!user || user.role !== "admin") {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				const id = parseInt(req.params.id);
				if (id === user.id) {
					return jsonResponse({ error: "Cannot delete yourself" }, 400);
				}
				deleteUser.run(id);
				return jsonResponse({ success: true });
			},
		},

		"/": (req) => {
			const user = getSession(req);
			return renderView("home", {
				logged_in: user ? "true" : "",
				username: user?.display_name || user?.username || "",
				is_admin: user?.role === "admin" ? "true" : "",
				is_editor:
					user?.role === "editor" || user?.role === "admin" ? "true" : "",
			});
		},

		"/home": (req) => {
			const user = getSession(req);
			return renderView("home", {
				logged_in: user ? "true" : "",
				username: user?.display_name || user?.username || "",
				is_admin: user?.role === "admin" ? "true" : "",
				is_editor:
					user?.role === "editor" || user?.role === "admin" ? "true" : "",
			});
		},

		"/login": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			if (user) {
				return Response.redirect(url.origin + "/", 302);
			}
			return renderView("login");
		},

		"/invite/:token": (req) => {
			const { token } = req.params;
			const invitation = getInvitation.get(token);

			if (!invitation) {
				return renderView("login", { error: "Invalid or expired invitation" });
			}

			return renderView("invite", { token, role: invitation.role });
		},

		"/profile": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			if (!user) {
				return Response.redirect(url.origin + "/login", 302);
			}
			return renderView("profile", {
				username: user.username,
				display_name: user.display_name || "",
				profile_image: user.profile_image || "",
				description: user.description || "",
			});
		},

		"/articles": (req) => {
			const user = getSession(req);
			return renderView("articles", {
				logged_in: user ? "true" : "",
				is_editor:
					user?.role === "editor" || user?.role === "admin" ? "true" : "",
				user_role: user?.role || "",
			});
		},

		"/article/:slug": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			const { slug } = req.params;
			const article = getArticle.get(slug);

			if (!article) {
				return new Response("Article not found", { status: 404 });
			}

			const hasPassword =
				article.visibility === "password" &&
				hasPasswordAccess(req, "article", slug);
			const canAccess = canAccessContent(
				article.visibility,
				user?.role,
				article.password,
				hasPassword ? article.password : null,
			);

			if (!canAccess) {
				if (article.visibility === "password") {
					const error = url.searchParams.get("error");
					return renderView("password", {
						resource_type: "article",
						resource_slug: slug,
						error: error === "invalid_password" ? "Mot de passe incorrect" : "",
					});
				}
				return Response.redirect(url.origin + "/login", 302);
			}

			if (
				url.searchParams.get("edit") &&
				user &&
				(user.role === "editor" || user.role === "admin")
			) {
				const folders = getAllFolders.all();
				return renderView("edit", {
					article_id: article.id,
					title: article.title,
					content: article.content,
					folder_id: article.folder_id || "",
					visibility: article.visibility,
					password: article.password || "",
					image: article.image || "",
					description: article.description || "",
					folders_json: JSON.stringify(folders),
				});
			}

			const renderedContent = renderMarkdown(article.content);

			const articleUrl = `${url.origin}/article/${article.slug}`;
			const imageUrl = article.image
				? article.image.startsWith("http")
					? article.image
					: `${url.origin}${article.image}`
				: `${url.origin}/public/default-og.jpg`;

			const seoMeta =
				article.visibility === "public"
					? `
        <meta name="description" content="${escapeHtml(article.description || article.title)}">
        <meta name="author" content="${escapeHtml(article.author_name || "Wiki-MD")}">
        <link rel="canonical" href="${articleUrl}">
        <meta property="og:type" content="article">
        <meta property="og:url" content="${articleUrl}">
        <meta property="og:title" content="${escapeHtml(article.title)}">
        <meta property="og:description" content="${escapeHtml(article.description || article.title)}">
        <meta property="og:image" content="${imageUrl}">
        <meta property="og:site_name" content="Wiki-MD">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${escapeHtml(article.title)}">
        <meta name="twitter:description" content="${escapeHtml(article.description || article.title)}">
        <meta name="twitter:image" content="${imageUrl}">
    `
					: '<meta name="robots" content="noindex, nofollow">';

			let folderArticlesHtml = "";
			let folderName = "";
			let folderSlug = "";
			let hasFolder = "";

			if (article.folder_id) {
				const folder = getFolderById.get(article.folder_id);
				const folderArticles = getArticlesByFolder.all(article.folder_id);

				if (folder) {
					folderName = folder.name;
					folderSlug = folder.slug;
					hasFolder = "true";

					folderArticlesHtml = folderArticles
						.map((a) => {
							const isActive = a.id === article.id ? ' class="active"' : "";
							return `<a href="/article/${a.slug}"${isActive}>${escapeHtml(a.title)}</a>`;
						})
						.join("");
				}
			}

			return renderView("article", {
				title: article.title,
				content: renderedContent,
				seo_meta: seoMeta,
				can_edit:
					user && (user.role === "editor" || user.role === "admin")
						? "true"
						: "",
				article_slug: article.slug,
				has_folder: hasFolder,
				folder_name: folderName,
				folder_slug: folderSlug,
				folder_articles: folderArticlesHtml,
				portfolio_link:
					process.env.PORTFOLIO_LINK || "https://tonportfolio.com",
				donation_link: process.env.DONATION_LINK || "https://tonliendedon.com",
			});
		},

		"/folder/:slug": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			const { slug } = req.params;
			const folder = getFolder.get(slug);

			if (!folder) {
				return new Response("Folder not found", { status: 404 });
			}

			const hasPassword =
				folder.visibility === "password" &&
				hasPasswordAccess(req, "folder", slug);
			const canAccess = canAccessContent(
				folder.visibility,
				user?.role,
				folder.password,
				hasPassword ? folder.password : null,
			);

			if (!canAccess) {
				if (folder.visibility === "password") {
					const error = url.searchParams.get("error");
					return renderView("password", {
						resource_type: "folder",
						resource_slug: slug,
						error: error === "invalid_password" ? "Mot de passe incorrect" : "",
					});
				}
				return Response.redirect(url.origin + "/login", 302);
			}

			// Mode édition du dossier
			if (
				url.searchParams.get("edit") &&
				user &&
				(user.role === "editor" || user.role === "admin")
			) {
				const folderArticles = getArticlesByFolder.all(folder.id);
				return renderView("edit-folder", {
					folder_id: folder.id,
					slug: folder.slug,
					name: folder.name,
					description: folder.description || "",
					visibility: folder.visibility,
					password: folder.password || "",
					articles_json: JSON.stringify(folderArticles),
				});
			}

			// Affichage normal du dossier
			const articles = getArticlesByFolder.all(folder.id);
			return renderView("folder", {
				folder_name: folder.name,
				folder_slug: folder.slug,
				folder_description: folder.description || "",
				folder_id: folder.id,
				articles_json: JSON.stringify(articles),
				can_edit:
					user && (user.role === "editor" || user.role === "admin")
						? "true"
						: "",
			});
		},

		"/folders": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			if (!user || (user.role !== "editor" && user.role !== "admin")) {
				return Response.redirect(url.origin + "/login", 302);
			}

			const folders = getAllFolders.all();
			return renderView("folders", {
				folders_json: JSON.stringify(folders),
				is_admin: user.role === "admin" ? "true" : "",
			});
		},

		"/admin": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			if (!user || user.role !== "admin") {
				return Response.redirect(url.origin + "/", 302);
			}
			return renderView("admin");
		},

		"/new": (req) => {
			const user = getSession(req);
			const url = new URL(req.url);
			if (!user || (user.role !== "editor" && user.role !== "admin")) {
				return Response.redirect(url.origin + "/", 302);
			}
			const folders = getAllFolders.all();
			return renderView("edit", {
				article_id: "",
				title: "",
				content: "",
				folder_id: "",
				visibility: "logged",
				password: "",
				image: "",
				description: "",
				folders_json: JSON.stringify(folders),
			});
		},
	},
});

console.log(`🚀 Wiki-MD server running on http://localhost:${PORT}`);
