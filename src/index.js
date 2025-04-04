const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { LRUCache } = require('lru-cache');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Cache configuration
const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

// API Configuration
const API_BASE_URL = 'http://20.244.56.144';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiZXhwIjoxNzQzNzQ3NjA1LCJpYXQiOjE3NDM3NDczMDUsImlzcyI6IkFmZm9yZG1lZCIsImp0aSI6IjdlZjAyNDgxLWMyYmYtNDA3Mi1hYzBlLTBjN2NkODBjZWRhZSIsInN1YiI6ImUyMmNzZXUwODI0QGJlbm5ldHQuZWR1LmluIn0sImVtYWlsIjoiZTIyY3NldTA4MjRAYmVubmV0dC5lZHUuaW4iLCJuYW1lIjoidmFpYmhhdiBrYXVzaGlrIiwicm9sbE5vIjoiZTIyY3NldTA4MjQiLCJhY2Nlc3NDb2RlIjoicnRDSFpKIiwiY2xpZW50SUQiOiI3ZWYwMjQ4MS1jMmJmLTQwNzItYWMwZS0wYzdjZDgwY2VkYWUiLCJjbGllbnRTZWNyZXQiOiJnZ1pNTk1Ed3dIQ2F4TnNDIn0.y8R4aoXrsh6ArfrDB-OuiSeFheatPZ_HC7ZVHng-jJw';

// Axios instance with auth token
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Helper functions
async function fetchUsers() {
  try {
    const response = await api.get('/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

async function fetchUserPosts(userId) {
  try {
    const response = await api.get(`/users/${userId}/posts`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching posts for user ${userId}:`, error);
    throw error;
  }
}

async function fetchPosts() {
  try {
    const response = await api.get('/posts');
    return response.data;
  } catch (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }
}

async function fetchPostComments(postId) {
  try {
    const response = await api.get(`/posts/${postId}/comments`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching comments for post ${postId}:`, error);
    throw error;
  }
}

// Cache update functions
async function updateTopUsersCache() {
  try {
    const users = await fetchUsers();
    const usersWithPostCounts = await Promise.all(
      users.map(async (user) => {
        const posts = await fetchUserPosts(user.id);
        return {
          ...user,
          postCount: posts.length
        };
      })
    );

    const topUsers = usersWithPostCounts
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 5);

    cache.set('topUsers', topUsers);
  } catch (error) {
    console.error('Error updating top users cache:', error);
  }
}

async function updatePopularPostsCache() {
  try {
    const posts = await fetchPosts();
    const postsWithComments = await Promise.all(
      posts.map(async (post) => {
        const comments = await fetchPostComments(post.id);
        return {
          ...post,
          commentCount: comments.length
        };
      })
    );

    const popularPosts = postsWithComments
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, 1);

    cache.set('popularPosts', popularPosts);
  } catch (error) {
    console.error('Error updating popular posts cache:', error);
  }
}

async function updateLatestPostsCache() {
  try {
    const posts = await fetchPosts();
    const latestPosts = posts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    cache.set('latestPosts', latestPosts);
  } catch (error) {
    console.error('Error updating latest posts cache:', error);
  }
}

// Schedule cache updates
cron.schedule('*/5 * * * *', () => {
  updateTopUsersCache();
  updatePopularPostsCache();
  updateLatestPostsCache();
});

// Initial cache population
updateTopUsersCache();
updatePopularPostsCache();
updateLatestPostsCache();

// API Routes
app.get('/users', async (req, res) => {
  try {
    const topUsers = cache.get('topUsers');
    if (!topUsers) {
      await updateTopUsersCache();
      return res.json(cache.get('topUsers'));
    }
    res.json(topUsers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/posts', async (req, res) => {
  try {
    const { type } = req.query;
    
    if (type === 'popular') {
      const popularPosts = cache.get('popularPosts');
      if (!popularPosts) {
        await updatePopularPostsCache();
        return res.json(cache.get('popularPosts'));
      }
      res.json(popularPosts);
    } else if (type === 'latest') {
      const latestPosts = cache.get('latestPosts');
      if (!latestPosts) {
        await updateLatestPostsCache();
        return res.json(cache.get('latestPosts'));
      }
      res.json(latestPosts);
    } else {
      res.status(400).json({ error: 'Invalid type parameter' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 