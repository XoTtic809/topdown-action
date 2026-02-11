# 🚀 Deployment Guide

This guide will walk you through deploying Topdown Action to GitHub Pages so anyone can play your game online!

## 📋 Prerequisites

- A GitHub account
- Git installed on your computer
- Basic command line knowledge

---

## 🎯 Quick Deployment (5 minutes)

### Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and log in
2. Click the **+** icon in the top right → **New repository**
3. Repository name: `topdown-action` (or any name you like)
4. Description: "An intense browser-based top-down shooter game"
5. Choose **Public**
6. ✅ Check "Add a README file" *(you'll replace it)*
7. Choose License: **MIT**
8. Click **Create repository**

### Step 2: Clone and Add Your Game

Open your terminal/command prompt:

```bash
# Clone your new repository
git clone https://github.com/YOUR_USERNAME/topdown-action.git
cd topdown-action

# Copy your game files into this directory
# (Copy index.html, game.js, styles.css, README.md, LICENSE)

# Add all files
git add .

# Commit the files
git commit -m "Add Topdown Action game"

# Push to GitHub
git push origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top navigation)
3. Scroll down and click **Pages** (left sidebar)
4. Under **Source**:
   - Branch: Select `main`
   - Folder: Select `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes for deployment

### Step 4: Play Your Game! 🎮

Your game is now live at:
```
https://YOUR_USERNAME.github.io/topdown-action/
```

Share this link with anyone - they can play instantly in their browser!

---

## 🔄 Updating Your Game

After making changes to your local files:

```bash
# Add changes
git add .

# Commit with a message
git commit -m "Add dash ability and boss improvements"

# Push to GitHub
git push origin main
```

GitHub Pages will automatically rebuild (takes 1-2 minutes).

---

## 🛠️ Custom Domain (Optional)

Want to use your own domain like `game.yourname.com`?

1. Buy a domain from Namecheap, GoDaddy, etc.
2. In your repository settings → Pages:
   - Enter your custom domain
   - Click **Save**
3. Add a `CNAME` file to your repository:
   ```bash
   echo "game.yourname.com" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```
4. Configure your domain's DNS:
   - Add a CNAME record pointing to `YOUR_USERNAME.github.io`
5. Wait for DNS propagation (can take up to 24 hours)

---

## 📊 Analytics (Optional)

Want to see how many people are playing?

### Google Analytics

1. Get a Google Analytics tracking ID
2. Add this to your `index.html` before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 🐛 Troubleshooting

### Game not showing up?
- Make sure GitHub Pages is enabled in Settings → Pages
- Wait 2-3 minutes after pushing
- Check that all files (index.html, game.js, styles.css) are in the root directory
- Try clearing your browser cache (Ctrl+Shift+R or Cmd+Shift+R)

### 404 Error?
- Verify the repository is public
- Check the URL matches: `https://YOUR_USERNAME.github.io/REPO_NAME/`
- Ensure `index.html` is in the root directory

### Changes not appearing?
- GitHub Pages can take 1-2 minutes to rebuild
- Clear your browser cache
- Check the commit was successful: `git log`

### Files not uploading?
- Make sure you're in the correct directory: `pwd`
- Check git status: `git status`
- Verify files exist: `ls -la`

---

## 🎉 Next Steps

- Share your game link on social media!
- Add a screenshot to your README
- Submit to game directories like itch.io
- Add your game to your portfolio
- Share on Reddit (r/webgames, r/gamedev)

---

## 📱 Mobile Optimization

Your game works on mobile, but for the best experience:

1. Test on various devices
2. Consider adding touch controls for dash
3. Optimize particle effects for performance
4. Test on slow connections

---

## 🔒 Security & Privacy

- No user data is collected by default
- High scores are stored locally (localStorage)
- All code runs in the browser (no server needed)
- If you add analytics, update your privacy policy

---

## 💰 Monetization (Optional)

Want to monetize your game?

- Add ads with Google AdSense
- Create a Patreon for supporters
- Sell on itch.io ($1-5)
- Add a "Buy Me a Coffee" button

---

## 📧 Support

Having issues? 
- Check the [main README](README.md)
- Open an [issue](../../issues)
- Check GitHub Pages [documentation](https://docs.github.com/en/pages)

---

**🌟 Congrats! Your game is now live on the internet! 🌟**
