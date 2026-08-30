import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true,
  // Do not leave the auth bootstrap or a finance request spinning forever
  // when the separately deployed backend is unavailable.
  timeout: 15000,
});

export default api;
