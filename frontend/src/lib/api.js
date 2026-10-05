import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:5000/api'});
api.interceptors.request.use(c=>{const t=localStorage.getItem('sa_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c;});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401){localStorage.removeItem('sa_token');localStorage.removeItem('sa_user');}return Promise.reject(e);});
export const getUser=()=>JSON.parse(localStorage.getItem('sa_user')||'null');
export const saveSession=(token,user)=>{localStorage.setItem('sa_token',token);localStorage.setItem('sa_user',JSON.stringify(user));};
export const clearSession=()=>{localStorage.removeItem('sa_token');localStorage.removeItem('sa_user');};
