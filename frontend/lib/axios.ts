import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // send HttpOnly np_refresh cookie on auth endpoints
});

// Attach JWT access token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('np_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track whether a refresh is already in-flight to avoid parallel refresh storms
let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  try {
    const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    const { access_token } = res.data;
    Cookies.set('np_token', access_token, { expires: 1 / 96 }); // ~15 min
    return access_token;
  } catch {
    return null;
  }
}

// On 401 → try refresh once, retry original request, then redirect to login
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;

      if (!refreshing) refreshing = tryRefresh().finally(() => { refreshing = null; });
      const newToken = await refreshing;

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);  // retry with new token
      }

      // Refresh failed — clear auth and redirect to login
      Cookies.remove('np_token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export default api;
