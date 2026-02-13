export function renderMarkdown(markdownText) {
	const html = Bun.markdown.html(markdownText, {
		tables: true,
		strikethrough: true,
		tasklists: true,
		autolinks: true,
		hardSoftBreaks: false,
		headings: {
			ids: true,
		},
	});

	return html;
}

export function escapeHtml(text) {
	const map = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}
