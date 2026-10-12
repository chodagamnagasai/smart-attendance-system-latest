import axios from 'axios';

function normalizeApiUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  return /\/api$/i.test(url) ? url : `${url}/api`;
}

const configuredUrl = import.meta.env.VITE_API_URL;
const fallbackUrl = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';
export const API_BASE_URL = normalizeApiUrl(configuredUrl || fallbackUrl);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { Accept: 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('sa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sa_token');
      localStorage.removeItem('sa_user');
    }
    return Promise.reject(error);
  }
);

export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('sa_user') || 'null');
  } catch {
    localStorage.removeItem('sa_user');
    return null;
  }
};

export const saveSession = (token, user) => {
  localStorage.setItem('sa_token', token);
  localStorage.setItem('sa_user', JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem('sa_token');
  localStorage.removeItem('sa_user');
};
