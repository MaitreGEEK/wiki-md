# 📚 Wiki-MD

A simple and intuitive self-hosted wiki that lets you upload, edit, and organize Markdown files directly in your browser.

## ✨ Features

- 📝 **Markdown Editing**: Real-time preview editor inspired by Obsidian
- 👥 **User Management**: Three access levels (readers, editors, admins)
- 🔒 **Access Control**: Public articles, password-protected, or restricted to logged-in users
- 📁 **Organization**: Folder system to classify your articles
- 🔍 **Search**: Real-time search across all accessible articles
- 🎨 **Modern Interface**: Clean design with dark theme
- 🚀 **Performance**: Powered by Bun.js for ultra-fast execution
- 🐳 **Docker Ready**: Simplified deployment with Docker

## 🛠️ Tech Stack

- **Runtime**: [Bun.js](https://bun.sh/) - Ultra-fast JavaScript runtime
- **HTTP Server**: `bun.serve` - Bun's native HTTP server
- **Database**: SQLite via `bun:sqlite` - Embedded database
- **Authentication**: Secure sessions with `bun.cookies`
- **Markdown**: Custom renderer with full support
- **Containerization**: Multi-architecture Docker (amd64, arm64)

## 📦 Installation

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.9
- Docker (optional)

### Local Installation

```bash
# Clone the repository
git clone https://github.com/your-username/wiki-md.git
cd wiki-md

# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Edit .env file and configure your variables
nano .env

# Run in development mode
bun run dev

# Or run in production
bun start
```

### Docker Installation

```bash
# Build the image
docker build -t wiki-md .

# Run the container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e SECRET=your-secret-key \
  -e LIST_ADMIN=admin:password123 \
  --name wiki-md \
  wiki-md
```

### Docker Compose

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your values

# Start
docker-compose up -d
```

## ⚙️ Configuration

Create a `.env` file at the project root:

```env
# Server port
PORT=3000

# Markdown files storage directory
DATA_DIRECTORY=./data

# Initial administrator list (format: username:password,username2:password2)
LIST_ADMIN=admin:admin123

# Secret key for sessions (CHANGE THIS IN PRODUCTION!)
SECRET=your-secret-key-change-this-in-production
```

## 👥 User Management

### User Types

- **Readers**: Can only read content accessible to them
- **Editors**: Can create, edit, and publish articles and folders
- **Admins**: Full access + user management

### Creating Users

Admins can create users in three ways:

1. **With generated password**: System generates a secure password
2. **With defined password**: Admin sets the password
3. **Via invitation link**: User creates their own account via unique link

## 📝 Usage

### Create an Article

1. Log in with an editor or admin account
2. Click "New Article"
3. Write your content in Markdown
4. Configure visibility settings
5. Save

### Organize with Folders

Folders allow you to group articles by theme. Articles in a folder inherit the folder's permissions by default, unless you modify them individually.

### Access Control

Each article and folder can have a visibility level:

- **Public**: Accessible to everyone (indexed by search engines)
- **Logged Users**: Accessible only to authenticated users
- **Password Protected**: Accessible with a specific password
- **Editors Only**: Reserved for editors and admins
- **Admins Only**: Reserved for administrators

## 🚀 Deployment

### GitHub Container Registry

The project includes a GitHub Actions workflow that automatically builds and publishes a multi-architecture Docker image on each push.

```bash
# Pull the image from GHCR
docker pull ghcr.io/your-username/wiki-md:latest

# Run
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e SECRET=your-secret-key \
  -e LIST_ADMIN=admin:password123 \
  ghcr.io/your-username/wiki-md:latest
```

## 📄 License

This software is distributed under a free license. **It is strictly forbidden to sell this software**. However, its use in a commercial context or for commercial purposes is authorized.

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or pull request.

## 🔧 Development

```bash
# Development mode with hot reload
bun run dev

# Local Docker build
docker build -t wiki-md:dev .

# Tests
bun test
```

## 📚 Project Structure

```
wiki-md/
├── views/          # HTML templates
├── public/         # Static files (CSS, images)
├── data/           # Data storage (SQLite + MD files)
├── server.js       # Application entry point
├── db.js           # Database management
├── auth.js         # Authentication and sessions
├── utils.js        # Utility functions
├── markdown.js     # Markdown rendering
└── Dockerfile      # Docker configuration
```

## 💡 Tips

- Use search to quickly find your articles
- Organize your articles from the start with clear folders
- Public articles are automatically optimized for SEO
- Regularly backup the `data/` folder which contains your entire database

## 🐛 Support

For any questions or issues, open an issue on GitHub.

---

Made with ❤️ and [Bun](https://bun.sh/)
Donate: https://donate.maitregeek.eu
Other projects: https://portfolio.maitregeek.eu
