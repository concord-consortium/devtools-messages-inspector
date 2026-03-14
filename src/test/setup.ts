import '@testing-library/jest-dom/vitest';

// Suppress console.debug output during tests to keep vitest output clean.
// The debug logs (e.g., [Messages] prefix) are useful at runtime but noisy in tests.
vi.spyOn(console, 'debug').mockImplementation(() => {});

// jsdom does not implement scrollIntoView; stub it so components that call it don't throw.
Element.prototype.scrollIntoView = vi.fn();
