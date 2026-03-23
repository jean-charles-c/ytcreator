/**
 * @typedef {'queued' | 'processing' | 'failed' | 'completed'} RenderJobStatus
 *
 * @typedef {Object} RenderJob
 * @property {string} id - Unique job identifier (UUID)
 * @property {string} projectId - Reference to the project
 * @property {string[]} videoPromptIds - IDs of VideoPrompts included in this job
 * @property {RenderJobStatus} status - Current job status
 * @property {Object} payload - Full render payload (prompts, settings, metadata)
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string|null} errorMessage - Error details if failed
 * @property {string|null} resultUrl - URL to the rendered video if completed
 */

export {};
