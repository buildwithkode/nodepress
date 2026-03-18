import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from cookie to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('np_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 → clear auth and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('np_token');
      localStorage.removeItem('np_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
