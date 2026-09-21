const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
export const API_BASE_URL = envUrl ? envUrl.replace(/\/+$/, '') : "http://127.0.0.1:8000";
