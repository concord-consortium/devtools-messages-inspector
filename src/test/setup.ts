import '@testing-library/jest-dom/vitest';

// Suppress console.debug output during tests to keep vitest output clean.
// The debug logs (e.g., [Messages] prefix) are useful at runtime but noisy in tests.
vi.spyOn(console, 'debug').mockImplementation(() => {});
