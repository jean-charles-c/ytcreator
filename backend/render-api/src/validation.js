/**
 * Payload validation for render job creation.
 */

/**
 * @param {any} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCreatePayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  // projectId — required string
  if (!body.projectId || typeof body.projectId !== "string") {
    errors.push("projectId is required and must be a non-empty string");
  } else if (body.projectId.length > 255) {
    errors.push("projectId must be 255 characters or less");
  }

  // videoPromptIds — required non-empty array of strings
  if (!Array.isArray(body.videoPromptIds) || body.videoPromptIds.length === 0) {
    errors.push("videoPromptIds is required and must be a non-empty array of strings");
  } else if (body.videoPromptIds.length > 200) {
    errors.push("videoPromptIds must contain at most 200 items");
  } else {
    const allStrings = body.videoPromptIds.every((id) => typeof id === "string" && id.length > 0);
    if (!allStrings) {
      errors.push("Each item in videoPromptIds must be a non-empty string");
    }
  }

  // payload — optional object
  if (body.payload !== undefined && (typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload))) {
    errors.push("payload must be a JSON object if provided");
  }

  return { valid: errors.length === 0, errors };
}
