# PreoCryptoFX - Netlify Deployment Guide

This project is optimized for deployment on **Netlify** with a full-stack architecture using **Netlify Functions**.

## Deployment Steps

1. **Connect to GitHub**: Push this code to a GitHub repository.
2. **Create Netlify Site**: Link your GitHub repository to a new site on Netlify.
3. **Configure Build Settings**:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
   - **Functions Directory**: `netlify/functions` (Netlify should detect this automatically from `netlify.toml`)
4. **Add Environment Variables**:
   In Netlify Dashboard (**Site Settings > Environment Variables**), add the following:
   - `PAYHERO_API_KEY`: Your Payhero API Key
   - `PAYHERO_CHANNEL_ID`: Your Payhero Channel ID
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key
   - `PAYHERO_CALLBACK_URL`: (Optional) Set to your Netlify URL + `/api/payhero/callback` (e.g., `https://your-site.netlify.app/api/payhero/callback`)

## How it Works

- **Frontend**: Built with React + Vite, served as a static SPA.
- **Backend**: The Express server logic is wrapped using `serverless-http` and runs as a Netlify Function.
- **Redirects**: The `netlify.toml` file automatically routes all `/api/*` requests to the Netlify Function and all other requests to `index.html` for SPA routing.

## Local Development

Run `npm run dev` to start the local development server on port 3000.
