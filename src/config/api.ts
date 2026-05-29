const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const EXTRACTION_ENDPOINT = `${API_BASE_URL}/transcriptions/extract`;
