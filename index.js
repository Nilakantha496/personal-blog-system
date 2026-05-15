require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Supabase client
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
  console.error('CRITICAL ERROR: Supabase Environment Variables are missing! Database connections will fail.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Safety middleware to prevent Vercel crashes if env vars are missing
app.use((req, res, next) => {
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
    return res.status(500).send(`
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 30px; border: 2px solid #ef4444; border-radius: 12px; background: #fef2f2; color: #991b1b;">
        <h2 style="margin-top: 0;">Missing Database Configuration</h2>
        <p>The application crashed because the Supabase environment variables are missing or invalid in this deployment.</p>
        <p>Please go to your Vercel Dashboard, open this project's settings, and add:</p>
        <ul>
          <li><strong>SUPABASE_URL</strong></li>
          <li><strong>SUPABASE_ANON_KEY</strong></li>
        </ul>
        <p><em>Remember to click "Redeploy" after adding them!</em></p>
      </div>
    `);
  }
  next();
});

// Auth Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token;
  res.locals.current_user = null;
  res.locals.messages = [];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.locals.current_user = decoded;
    } catch (err) {
      res.clearCookie('token');
    }
  }
  next();
};

const requireAuth = (req, res, next) => {
  if (!res.locals.current_user) {
    return res.redirect('/login');
  }
  next();
};

app.use(authMiddleware);

// Routes
app.get('/', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*, author:users(username)')
      .order('date_posted', { ascending: false });
      
    res.render('index', { posts: posts || [] });
  } catch (err) {
    console.error("Database connection error on homepage:", err);
    res.status(500).send(`
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 30px; border: 2px solid #ef4444; border-radius: 12px; background: #fef2f2; color: #991b1b;">
        <h2 style="margin-top: 0;">Database Connection Failed</h2>
        <p>The application could not connect to Supabase. This is usually caused by an invalid <strong>SUPABASE_URL</strong>.</p>
        <p><strong>Error details:</strong> ${err.message}</p>
        <p>Please double-check your Vercel Environment Variables to ensure your URL is exactly as it appears in the Supabase dashboard (e.g., https://xyz.supabase.co).</p>
      </div>
    `);
  }
});

app.get('/register', (req, res) => {
  if (res.locals.current_user) return res.redirect('/');
  res.render('register');
});

app.post('/register', async (req, res) => {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    res.locals.messages.push({ category: 'danger', text: 'MISSING ENVIRONMENT VARIABLES: SUPABASE_URL is not set in this environment!' });
    return res.render('register');
  }

  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const { data: existing } = await supabase.from('users').select('*').eq('email', email).single();
  if (existing) {
    res.locals.messages.push({ category: 'danger', text: 'Email already registered.' });
    return res.render('register');
  }
  
  const { data, error } = await supabase.from('users').insert([
    { username, email, password: hashedPassword }
  ]).select().single();
  
  if (error) {
    console.error('Supabase registration error:', error);
    res.locals.messages.push({ category: 'danger', text: `Error registering account: ${error.message}` });
    return res.render('register');
  }
  
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (res.locals.current_user) return res.redirect('/');
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
  
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/');
  } else {
    res.locals.messages.push({ category: 'danger', text: 'Login Unsuccessful. Please check email and password' });
    res.render('login');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

app.get('/post/new', requireAuth, (req, res) => {
  res.render('create_post', { title: 'New Post', legend: 'New Post', post: null });
});

app.post('/post/new', requireAuth, async (req, res) => {
  const { title, content } = req.body;
  await supabase.from('posts').insert([
    { title, content, user_id: res.locals.current_user.id }
  ]);
  res.redirect('/');
});

app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  const { data: post } = await supabase.from('posts').select('*, author:users(username)').eq('id', id).single();
  
  if (!post) return res.status(404).send('Post not found');
  res.render('post', { post });
});

app.get('/post/:id/update', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: post } = await supabase.from('posts').select('*').eq('id', id).single();
  
  if (!post || post.user_id !== res.locals.current_user.id) {
    return res.redirect('/');
  }
  res.render('create_post', { title: 'Update Post', legend: 'Update Post', post });
});

app.post('/post/:id/update', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const { data: post } = await supabase.from('posts').select('*').eq('id', id).single();
  
  if (post && post.user_id === res.locals.current_user.id) {
    await supabase.from('posts').update({ title, content }).eq('id', id);
  }
  res.redirect(`/post/${id}`);
});

app.post('/post/:id/delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: post } = await supabase.from('posts').select('*').eq('id', id).single();
  
  if (post && post.user_id === res.locals.current_user.id) {
    await supabase.from('posts').delete().eq('id', id);
  }
  res.redirect('/');
});

// Comments API
app.get('/api/posts/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { data: comments } = await supabase
    .from('comments')
    .select('*, author:users(username)')
    .eq('post_id', id)
    .order('date_posted', { ascending: true });
    
  const formatted = (comments || []).map(c => ({
    id: c.id,
    content: c.content,
    author: c.author.username,
    date_posted: new Date(c.date_posted).toLocaleString(),
    is_author: res.locals.current_user && res.locals.current_user.id === c.user_id
  }));
  res.json(formatted);
});

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  const { data, error } = await supabase.from('comments').insert([
    { content, post_id: id, user_id: res.locals.current_user.id }
  ]).select('*, author:users(username)').single();
  
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: comment } = await supabase.from('comments').select('*').eq('id', id).single();
  
  if (comment && comment.user_id === res.locals.current_user.id) {
    await supabase.from('comments').delete().eq('id', id);
    res.json({ message: 'Deleted' });
  } else {
    res.status(403).json({ error: 'Unauthorized' });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
