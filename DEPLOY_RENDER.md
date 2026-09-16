# Deploying Aperture to Render.com

This application is fully configured for deployment on [Render.com](https://render.com) using **Node.js Web Services** with full support for:
- Static SPA frontend serving (`dist/`)
- Express REST APIs (`/api/*`)
- Real-time WebSocket streaming (`/ws`)
- MongoDB Atlas database connectivity
- Automatic HTTPS and zero-downtime deploys

---

## Option 1: Automatic Blueprint Deploy (Recommended)

1. Push this repository to your **GitHub** or **GitLab** account.
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your repository. Render will automatically detect [`render.yaml`](./render.yaml).
5. Fill in the required environment variables when prompted:
   - **`MONGODB_URI`**: Your MongoDB Atlas connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/aperture?retryWrites=true&w=majority`).
   - **`GEMINI_API_KEY`**: Your Google Gemini API key.
   - **`PEOPLE_TRACKING_API_HOST`**: *(Optional)* GAO people tracking server host URL if connecting to hardware.
6. Click **Apply**. Render will build and deploy your application automatically!

---

## Option 2: Manual Web Service Deploy

If you prefer to configure the Web Service manually in the Render dashboard:

1. Click **New +** → **Web Service**.
2. Select your repository.
3. Configure the service settings:
   - **Name**: `aperture-people-tracking`
   - **Region**: Select your preferred region (e.g., *Oregon (US West)*, *Frankfurt (EU)*, or *Singapore (Asia)*)
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave blank (root of repository)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` or `Starter` (Starter recommended for persistent WebSocket connections)

4. Add the following **Environment Variables** in the Render settings:
   | Key | Value / Description | Required? |
   |---|---|---|
   | `NODE_ENV` | `production` | **Yes** |
   | `PORT` | `10000` | **Yes** |
   | `MONGODB_URI` | `mongodb+srv://...` (Your MongoDB Atlas connection string) | **Yes** |
   | `JWT_SECRET` | A secure random 32+ character string (e.g. `openssl rand -hex 32`) | **Yes** |
   | `GEMINI_API_KEY` | Your Gemini AI API Key | **Yes** |
   | `GEMINI_MODEL` | `gemini-2.5-flash` | Optional |
   | `APP_URL` | Your Render URL (e.g. `https://aperture-people-tracking.onrender.com`) | Optional |
   | `ADMIN_INITIAL_EMAIL` | Admin login email (e.g. `admin@aperture.com`) | Optional |
   | `ADMIN_INITIAL_PASSWORD` | Admin initial login password | Optional |
   | `PEOPLE_TRACKING_API_HOST`| Upstream GAO Cloud API URL | Optional |
   | `GAO_DEVICE_API_KEY` | Upstream GAO RFID Reader Device Key | Optional |
   | `GAO_READER_MODE` | `mock` | Optional |
   | `GAO_SIMULATOR_ENABLED` | `false` | Optional |

5. Under **Advanced**:
   - **Health Check Path**: `/api/health`
   - **Auto-Deploy**: `Yes`

6. Click **Create Web Service**.

---

## Verifying Deployment

Once deployed, Render will provide a live URL such as `https://aperture-people-tracking.onrender.com`.

- Health Check Endpoint: `https://<your-app>.onrender.com/api/health`
- Web Dashboard: `https://<your-app>.onrender.com`
- WebSocket Endpoint: `wss://<your-app>.onrender.com/ws`
