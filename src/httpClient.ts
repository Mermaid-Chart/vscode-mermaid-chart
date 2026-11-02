import axios, { AxiosInstance } from 'axios';
import { defaultBaseURL } from "./config";
import { applyAxiosNetworkConfig, wrapNetworkError } from "./httpSetup";

const httpClient: AxiosInstance = axios.create({
  baseURL: defaultBaseURL,
  headers: {
    'Content-Type': 'application/json',
    },
});

applyAxiosNetworkConfig(httpClient);

httpClient.interceptors.response.use(
  response => response,
  error => {
    console.error('HTTP Client error:', error);
    return Promise.reject(wrapNetworkError(error));
  }
);

export default httpClient; 
